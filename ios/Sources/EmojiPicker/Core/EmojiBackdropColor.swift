import UIKit

extension UIColor {
    /// Converts a validated `#RGB`/`#RRGGBB`/`#RRGGBBAA` hex string into a `UIColor`. Assumes the
    /// input already matches that shape (validated by the caller, `EmojiPicker.present`) - not
    /// defensive against arbitrary input.
    convenience init(emojiPickerBackdropHex hex: String) {
        var chars = Array(hex)
        if chars.first == "#" {
            chars.removeFirst()
        }
        if chars.count == 3 {
            chars = chars.flatMap { [$0, $0] }
        }

        func component(_ index: Int) -> CGFloat {
            CGFloat(UInt8(String(chars[index...index + 1]), radix: 16) ?? 0) / 255
        }

        let red = component(0)
        let green = component(2)
        let blue = component(4)
        let alpha = chars.count == 8 ? component(6) : 1

        self.init(red: red, green: green, blue: blue, alpha: alpha)
    }
}
