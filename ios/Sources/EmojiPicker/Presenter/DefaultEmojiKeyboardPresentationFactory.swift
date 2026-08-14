import UIKit

/// A `UITextField` dedicated to emoji selection. Overrides `textInputMode` to force the system's
/// "emoji" keyboard input mode when available.
///
/// UNDOCUMENTED BEHAVIOR: `UIResponder.textInputMode` is a computed property Apple documents as
/// read-only ("the text input mode currently in use"), but overriding it to return a specific
/// `UITextInputMode` is a long-standing (iOS 8+) community technique to steer which keyboard
/// variant becomes active on `becomeFirstResponder()`. Apple does not document or guarantee this
/// keeps working. If a future iOS version stops honoring it, the verification performed by
/// `EmojiKeyboardContainerViewController` after `becomeFirstResponder()` will detect that the
/// active mode's `primaryLanguage` isn't `"emoji"` and the presenter settles `NATIVE_UNAVAILABLE`
/// instead of silently showing the wrong keyboard.
final class EmojiTextField: UITextField {
    override var textInputMode: UITextInputMode? {
        UITextInputMode.activeInputModes.first { $0.primaryLanguage == "emoji" } ?? super.textInputMode
    }
}

/// Real UIKit implementation of `EmojiKeyboardPresentationFactory`. Presents a small, transparent
/// view controller hosting an `EmojiTextField` whose only purpose is to surface the system emoji
/// keyboard and capture what the user types into it.
final class DefaultEmojiKeyboardPresentationFactory: EmojiKeyboardPresentationFactory {
    func create(
        hostViewController: UIViewController,
        closeButtonOptions: EmojiCloseButtonOptions,
        dismissOnBackdropTap: Bool,
        theme: String,
        listener: EmojiKeyboardPresentationListener
    ) -> EmojiKeyboardPresentationHandle {
        guard hostViewController.presentedViewController == nil else {
            // Presenting on top of an already-presented view controller would be silently
            // ignored/log-warned by UIKit; report unavailable instead of attempting it.
            listener.onUnavailable()
            return NoopHandle()
        }

        let container = EmojiKeyboardContainerViewController(
            listener: listener,
            closeButtonOptions: closeButtonOptions,
            dismissOnBackdropTap: dismissOnBackdropTap,
            theme: theme
        )
        container.modalPresentationStyle = .overFullScreen
        container.modalTransitionStyle = .crossDissolve
        // Themes the container's own view subtree (backdrop, close button tint) - separate from
        // `emojiField.keyboardAppearance` below, which is what the system emoji keyboard itself
        // (a separate window/process) actually honors.
        container.overrideUserInterfaceStyle = Self.resolveInterfaceStyle(theme)
        // Must happen AFTER modalPresentationStyle is set: reading `presentationController`
        // lazily creates and caches one matching whatever style was active at that moment. Doing
        // this in the view controller's own init (before this call sets .overFullScreen) caches a
        // default .pageSheet-style presentation controller - with its own opaque backdrop - that
        // the later style change does not replace, which was the actual cause of the white sheet
        // covering the screen regardless of what modalPresentationStyle/backgroundColor said.
        container.presentationController?.delegate = container
        hostViewController.present(container, animated: false)

        return ContainerHandle(container: container)
    }

    private struct NoopHandle: EmojiKeyboardPresentationHandle {
        func dismiss() {}
    }

    /// Maps the JS `theme` string to the container's own trait override. `"system"` (or any
    /// unrecognized value) leaves it `.unspecified`, following the app/OS setting as before.
    fileprivate static func resolveInterfaceStyle(_ theme: String) -> UIUserInterfaceStyle {
        switch theme {
        case "light": return .light
        case "dark": return .dark
        default: return .unspecified
        }
    }

    private final class ContainerHandle: EmojiKeyboardPresentationHandle {
        private weak var container: EmojiKeyboardContainerViewController?

        init(container: EmojiKeyboardContainerViewController) {
            self.container = container
        }

        func dismiss() {
            guard let container = container, container.presentingViewController != nil else { return }
            container.dismiss(animated: false)
        }
    }
}

/// Where the close button docks above the keyboard.
enum EmojiCloseButtonPosition: String {
    case left
    case center
    case right
}

/// The close button's size. Raw values match the wire format from `EmojiCloseButtonOptions.size`.
enum EmojiCloseButtonSize: String {
    case xSmall
    case small
    case medium
    case large

    var pointSize: CGFloat {
        switch self {
        case .xSmall: return 24
        case .small: return 32
        case .medium: return 48
        case .large: return 64
        }
    }

    /// Keeps the glyph proportional to the button - matches the 64pt/24pt ratio the button
    /// shipped with before sizing became configurable.
    var symbolPointSize: CGFloat {
        pointSize * 0.375
    }
}

/// Hosts the invisible `EmojiTextField`, verifies the emoji input mode actually activated, and
/// forwards selection/dismissal/failure to its `listener` at most once.
///
/// Internal (not `private`) so `EmojiTextFieldDelegateTests` can exercise
/// `textField(_:shouldChangeCharactersIn:replacementString:)` directly via `@testable import` -
/// real emoji-keyboard presentation is not driveable headlessly in XCTest, but the full-string
/// capture contract at this layer is.
final class EmojiKeyboardContainerViewController: UIViewController, UITextFieldDelegate, UIAdaptivePresentationControllerDelegate, UIGestureRecognizerDelegate {

    /// How long to wait for `UITextInputCurrentInputModeDidChangeNotification` to confirm the
    /// emoji mode before giving up. Tunable after manual device QA.
    private static let emojiModeVerificationTimeout: TimeInterval = 0.5

    /// Vertical gap between the close button and the top edge of the keyboard.
    private static let closeButtonKeyboardGap: CGFloat = 12
    private static let closeButtonEdgeInset: CGFloat = 16

    private weak var listener: EmojiKeyboardPresentationListener?
    private let closeButtonOptions: EmojiCloseButtonOptions
    /// `dismissOnBackdropTap` OR'd with `closeButtonOptions.hidden`: a hidden close button must
    /// never leave the user with zero ways to dismiss the keyboard, so hiding it force-enables
    /// backdrop-tap-to-dismiss regardless of what was explicitly requested.
    private let effectiveDismissOnBackdropTap: Bool
    private let theme: String
    /// Internal (not `private`) so `EmojiTextFieldDelegateTests` can assert `keyboardAppearance`
    /// after `viewDidLoad` - mirrors the class-level visibility rationale above.
    let emojiField = EmojiTextField()
    private let closeButton: UIButton
    private var modeChangeObserver: NSObjectProtocol?
    private var verificationTimeoutWorkItem: DispatchWorkItem?
    private var hasReportedOutcome = false

    init(
        listener: EmojiKeyboardPresentationListener,
        closeButtonOptions: EmojiCloseButtonOptions,
        dismissOnBackdropTap: Bool,
        theme: String
    ) {
        self.listener = listener
        self.closeButtonOptions = closeButtonOptions
        self.effectiveDismissOnBackdropTap = dismissOnBackdropTap || closeButtonOptions.hidden
        self.theme = theme
        self.closeButton = Self.makeCloseButton(options: closeButtonOptions)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        emojiField.delegate = self
        emojiField.alpha = 0
        emojiField.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
        // The system emoji keyboard lives in a separate window/process and does not follow
        // `overrideUserInterfaceStyle` (set on this container for the plugin's own chrome, below);
        // `keyboardAppearance` is the mechanism the system keyboard itself honors.
        emojiField.keyboardAppearance = Self.resolveKeyboardAppearance(theme)
        view.addSubview(emojiField)

        setUpCloseButton()
        setUpBackdropTapIfNeeded()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)

        guard emojiField.becomeFirstResponder() else {
            reportUnavailable()
            return
        }

        if emojiField.textInputMode?.primaryLanguage == "emoji" {
            return
        }

        modeChangeObserver = NotificationCenter.default.addObserver(
            forName: UITextInputMode.currentInputModeDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleInputModeChange()
        }

        let timeoutWorkItem = DispatchWorkItem { [weak self] in
            self?.handleVerificationTimeout()
        }
        verificationTimeoutWorkItem = timeoutWorkItem
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.emojiModeVerificationTimeout, execute: timeoutWorkItem)
    }

    private func handleInputModeChange() {
        guard emojiField.textInputMode?.primaryLanguage == "emoji" else { return }
        verificationTimeoutWorkItem?.cancel()
        clearModeChangeObserver()
    }

    private func handleVerificationTimeout() {
        guard emojiField.textInputMode?.primaryLanguage != "emoji" else {
            clearModeChangeObserver()
            return
        }
        clearModeChangeObserver()
        reportUnavailable()
    }

    private func clearModeChangeObserver() {
        if let observer = modeChangeObserver {
            NotificationCenter.default.removeObserver(observer)
            modeChangeObserver = nil
        }
        verificationTimeoutWorkItem = nil
    }

    /// Maps the JS `theme` string to `UIKeyboardAppearance`. `"system"` (or any unrecognized
    /// value) leaves it `.default`, following the system keyboard's own OS-level setting as before.
    private static func resolveKeyboardAppearance(_ theme: String) -> UIKeyboardAppearance {
        switch theme {
        case "light": return .light
        case "dark": return .dark
        default: return .default
        }
    }

    /// A close button styled to match the system's own controls (Liquid Glass capsule on iOS 26+,
    /// a plain circular glyph button on earlier versions), pinned to `keyboardLayoutGuide` so it
    /// tracks the keyboard's position/animation directly, with a gap above it - rather than an
    /// `inputAccessoryView`, which iOS renders with its own system background material docked
    /// flush to the keyboard.
    private static func makeCloseButton(options: EmojiCloseButtonOptions) -> UIButton {
        let size = EmojiCloseButtonSize(rawValue: options.size) ?? .medium
        let symbolConfiguration = UIImage.SymbolConfiguration(pointSize: size.symbolPointSize, weight: .medium)

        // `UIButton.Configuration.glass()` is iOS 26 SDK API, only present when compiling with the
        // Swift 6.2 toolchain Xcode 26 ships. `#available` alone isn't enough to gate this: it's a
        // runtime check, but the `.glass` symbol must also resolve at compile time, which fails on
        // older Xcode/SDKs regardless of the runtime guard. Gate the whole branch behind a compiler
        // version check so older toolchains never see this code.
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            var configuration = UIButton.Configuration.glass()
            configuration.image = UIImage(systemName: "xmark")
            configuration.preferredSymbolConfigurationForImage = symbolConfiguration
            configuration.cornerStyle = .capsule
            return UIButton(configuration: configuration)
        }
        #endif

        let button = UIButton(type: .system)
        button.setImage(UIImage(systemName: "xmark.circle.fill", withConfiguration: symbolConfiguration), for: .normal)
        button.tintColor = .label
        return button
    }

    private func setUpCloseButton() {
        guard !closeButtonOptions.hidden else { return }

        let size = EmojiCloseButtonSize(rawValue: closeButtonOptions.size) ?? .medium
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(closeButton)

        NSLayoutConstraint.activate([
            closeButton.bottomAnchor.constraint(
                equalTo: view.keyboardLayoutGuide.topAnchor,
                constant: -Self.closeButtonKeyboardGap
            ),
            closeButton.widthAnchor.constraint(equalToConstant: size.pointSize),
            closeButton.heightAnchor.constraint(equalToConstant: size.pointSize),
        ])
        let position = EmojiCloseButtonPosition(rawValue: closeButtonOptions.position) ?? .right
        switch position {
        case .left:
            closeButton.leadingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.leadingAnchor,
                constant: Self.closeButtonEdgeInset
            ).isActive = true
        case .center:
            closeButton.centerXAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerXAnchor).isActive = true
        case .right:
            closeButton.trailingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.trailingAnchor,
                constant: -Self.closeButtonEdgeInset
            ).isActive = true
        }
    }

    /// Adds a tap gesture that dismisses when the user taps the transparent backdrop - anywhere
    /// in `view` that isn't a subview (the close button, primarily). The system keyboard itself
    /// lives in a separate window/responder chain, so this can't intercept its touches.
    private func setUpBackdropTapIfNeeded() {
        guard effectiveDismissOnBackdropTap else { return }
        let tapRecognizer = UITapGestureRecognizer(target: self, action: #selector(handleBackdropTap))
        tapRecognizer.delegate = self
        view.addGestureRecognizer(tapRecognizer)
    }

    // MARK: UIGestureRecognizerDelegate

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // Only recognize taps landing directly on the backdrop view itself, not on subviews
        // (the close button handles its own taps via its target/action).
        touch.view === view
    }

    @objc private func closeTapped() {
        reportDismissed()
    }

    @objc func handleBackdropTap() {
        reportDismissed()
    }

    // MARK: UITextFieldDelegate

    func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
        // The system lets the user switch away from the emoji keyboard (e.g. the "ABC" key) even
        // though it was forced active on becomeFirstResponder(). Rather than trying to block that
        // switch (there's no documented API to do so), filter here: only a single emoji Character
        // is ever forwarded as a selection, so plain text typed after switching keyboards is
        // silently ignored instead of being reported as if it were a picked emoji.
        guard let character = string.first, string.count == 1, character.isEmoji else { return false }
        reportSelected(string)
        return false
    }

    // MARK: UIAdaptivePresentationControllerDelegate

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        // Defensive: catches dismissal not initiated by our own code paths above.
        reportDismissed()
    }

    // MARK: Outcome reporting (exactly once)

    private func reportSelected(_ emoji: String) {
        guard !hasReportedOutcome else { return }
        hasReportedOutcome = true
        clearModeChangeObserver()
        listener?.onEmojiSelected(emoji)
        dismiss(animated: true)
    }

    private func reportDismissed() {
        guard !hasReportedOutcome else { return }
        hasReportedOutcome = true
        clearModeChangeObserver()
        listener?.onDismissed()
        dismiss(animated: true)
    }

    private func reportUnavailable() {
        guard !hasReportedOutcome else { return }
        hasReportedOutcome = true
        clearModeChangeObserver()
        listener?.onUnavailable()
        dismiss(animated: false)
    }

    // UIKeyboardType(rawValue: 124) is intentionally not used here. The issue frames it as an
    // optional, non-guaranteed secondary mechanism; stacking it alongside the textInputMode
    // override would add iOS-version-breakage surface with no corresponding test story. Revisit
    // as a follow-up only if the textInputMode override proves unreliable during manual QA.
}

/// Distinguishes real emoji characters from plain text, so input captured after the user manually
/// switches away from the forced emoji keyboard (there is no documented API to prevent that
/// switch) can be filtered out instead of being reported as a picked emoji.
extension Character {
    var isEmoji: Bool {
        isSimpleEmoji || isCombinedIntoEmoji
    }

    /// A single scalar that is itself presented as an emoji (excludes plain digits/punctuation
    /// that merely have the Unicode `Emoji` property for use in keycap sequences).
    private var isSimpleEmoji: Bool {
        guard let firstScalar = unicodeScalars.first else { return false }
        return firstScalar.properties.isEmojiPresentation || firstScalar.value > 0x238C
    }

    /// A multi-scalar grapheme cluster (ZWJ sequence, flag, skin-tone modifier, keycap) whose
    /// first scalar participates in emoji composition.
    private var isCombinedIntoEmoji: Bool {
        unicodeScalars.count > 1 && unicodeScalars.contains { $0.properties.isEmoji }
    }
}
