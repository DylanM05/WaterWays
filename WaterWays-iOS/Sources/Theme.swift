import SwiftUI
import UIKit

/// The v4 palette. Values match the website's --w-* tokens in WaterWays/src/index.css, light then dark.
enum Theme {
    static let bg = color(0xF2F6F6, 0x06171C)
    static let surface = color(0xFFFFFF, 0x0D242B)
    static let sunk = color(0xE8EFEF, 0x133039)
    static let line = color(0xD9E3E4, 0x1F3E47)

    static let inkUIColor = uiColor(light: 0x0D2830, dark: 0xE2EFF0)
    static let ink = Color(uiColor: inkUIColor)
    static let ink2 = color(0x4B626A, 0x9DB5BB)
    static let ink3 = color(0x7D9298, 0x6C878E)

    static let accent = color(0x0B7F8C, 0x45C4CC)
    static let accentInk = color(0xFFFFFF, 0x03262B)
    static let accentSoft = color(0xDAEFF0, 0x113E45)

    static let flow = color(0xB4691C, 0xE8A562)
    static let flowSoft = color(0xF5E6D4, 0x3A2914)

    static let gauge = color(0xC8322B, 0xE8483B)
    static let gaugePlate = color(0xFFFFFF, 0xDDE6E6)
    static let gaugeMark = color(0x15262B, 0x0D1E22)

    static let warn = color(0xE06A17, 0xF08A3E)
    static let warnOn = color(0xFFFFFF, 0x2A1203)
    static let warnBg = color(0xFDEEE2, 0x2C1A0C)
    static let warnLine = color(0xF3C7A3, 0x5B3416)
    static let warnInk = color(0x5A2A07, 0xFFD9BA)

    static let alertRed = color(0xC8322B, 0xEE5A4F)
    static let alertRedOn = color(0xFFFFFF, 0x2A0705)
    static let alertRedBg = color(0xFCEBE9, 0x2E1412)
    static let alertRedLine = color(0xF1BFBA, 0x612722)
    static let alertRedInk = color(0x5E1612, 0xFFD4CF)

    static let alertYellow = color(0xE3AE12, 0xE9C24C)
    static let alertYellowOn = color(0x2B2003, 0x261C02)
    static let alertYellowBg = color(0xFDF5DA, 0x262009)
    static let alertYellowLine = color(0xEDD993, 0x55471A)
    static let alertYellowInk = color(0x4A3905, 0xF6E3A9)

    static let water = color(0x0A6F7B, 0x11616B)
    static let waterDeep = color(0x075761, 0x0A444C)
    static let shallow = color(0xB5DCDF, 0x17444C)

    static func uiColor(light: UInt32, dark: UInt32) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) }
    }

    private static func color(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: uiColor(light: light, dark: dark))
    }
}

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

extension UIFont {
    /// Archivo, bundled as one variable font. `width` is the wdth axis (100 normal, 112 is the website's headings).
    /// The size scales with Dynamic Type relative to `style`.
    static func archivo(size: CGFloat, weight: CGFloat, width: CGFloat = 112, tabular: Bool = false, relativeTo style: UIFont.TextStyle) -> UIFont {
        let weightAxis = 0x7767_6874 // 'wght'
        let widthAxis = 0x7764_7468 // 'wdth'
        var attributes: [UIFontDescriptor.AttributeName: Any] = [
            .name: "Archivo-SemiBold",
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [weightAxis: weight, widthAxis: width],
        ]
        if tabular {
            attributes[.featureSettings] = [[
                UIFontDescriptor.FeatureKey.type: kNumberSpacingType,
                UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector,
            ]]
        }
        let font = UIFont(descriptor: UIFontDescriptor(fontAttributes: attributes), size: size)
        return UIFontMetrics(forTextStyle: style).scaledFont(for: font)
    }
}

extension Font {
    /// Titles and headings: Archivo, bold and slightly expanded.
    static func display(_ size: CGFloat, weight: CGFloat = 700, relativeTo style: UIFont.TextStyle = .title2) -> Font {
        Font(UIFont.archivo(size: size, weight: weight, relativeTo: style) as CTFont)
    }

    /// Readings: Archivo at normal width with tabular figures, so numbers don't shift as they update.
    static func number(_ size: CGFloat, weight: CGFloat = 600, relativeTo style: UIFont.TextStyle = .title2) -> Font {
        Font(UIFont.archivo(size: size, weight: weight, width: 100, tabular: true, relativeTo: style) as CTFont)
    }
}

extension View {
    /// The v4 card: a surface fill with a hairline border. Apply after the content's own padding.
    func cardBackground(cornerRadius: CGFloat = 18) -> some View {
        background(Theme.surface, in: RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius).strokeBorder(Theme.line))
    }

    /// An inset grouped list on the v4 background.
    func themedList() -> some View {
        listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
    }
}

/// App-wide UIKit styling that SwiftUI doesn't expose: large titles in Archivo.
@MainActor
func applyThemeAppearance() {
    let navigationBar = UINavigationBar.appearance()
    navigationBar.largeTitleTextAttributes = [
        .font: UIFont.archivo(size: 34, weight: 700, relativeTo: .largeTitle),
        .foregroundColor: Theme.inkUIColor,
        .kern: -0.8,
    ]
}
