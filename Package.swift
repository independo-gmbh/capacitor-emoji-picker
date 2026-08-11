// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "IndependoCapacitorEmojiPicker",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "IndependoCapacitorEmojiPicker",
            targets: ["EmojiPicker"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "EmojiPicker",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/EmojiPicker"),
        .testTarget(
            name: "EmojiPickerTests",
            dependencies: ["EmojiPicker"],
            path: "ios/Tests/EmojiPickerTests")
    ]
)
