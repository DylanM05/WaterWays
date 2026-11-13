import SwiftUI

/// The animated river behind the Explore search field, ported from the website's riverEngine.js: uneven banks,
/// a pale shallow margin, drifting current streaks, foam along the banks, and a duck, fishing bobbers and fish
/// that pass by now and then. The current speeds up while the field has focus. With Reduce Motion on, the river
/// is drawn still and nothing passes by.
struct RiverWater: View {
    var focused: Bool
    @State private var river = RiverSimulation()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { timeline in
            Canvas { context, size in
                river.layout(size: size)
                if !reduceMotion {
                    river.advance(to: timeline.date.timeIntervalSinceReferenceDate, current: focused ? 2.6 : 1)
                }
                river.draw(in: &context, focused: focused)
            }
        }
        .accessibilityHidden(true)
    }
}

private func between(_ low: Double, _ high: Double) -> Double { Double.random(in: low...high) }

/// Seeded, so the banks keep their shape when the river is laid out again.
private struct SeededRandom {
    private var state: UInt32
    init(seed: UInt32) { state = seed }
    mutating func next() -> Double {
        state = state &+ 0x6D2B_79F5
        var t = (state ^ (state >> 15)) &* (1 | state)
        t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
        return Double(t ^ (t >> 14)) / 4_294_967_296
    }
}

/// A smooth curve through the points (Catmull-Rom, as the website draws it).
private func addSmooth(_ points: [CGPoint], to path: inout Path) {
    for i in 0..<(points.count - 1) {
        let p0 = i > 0 ? points[i - 1] : points[i], p1 = points[i], p2 = points[i + 1]
        let p3 = i + 2 < points.count ? points[i + 2] : p2
        path.addCurve(
            to: p2,
            control1: CGPoint(x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6),
            control2: CGPoint(x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6)
        )
    }
}

/// Linear between keyframes, eased in and out within each step. Each frame is (offset, values...).
private func keyframe(_ frames: [[Double]], at t: Double) -> [Double] {
    guard let next = frames.firstIndex(where: { $0[0] >= t }), next > 0 else { return Array(frames[0].dropFirst()) }
    let a = frames[next - 1], b = frames[next]
    let local = (t - a[0]) / max(b[0] - a[0], 0.0001)
    let eased = local * local * (3 - 2 * local)
    return (1..<a.count).map { a[$0] + (b[$0] - a[$0]) * eased }
}

private final class RiverSimulation {
    private struct Geometry {
        var bank = 0.0, amp = 0.0, shallow = 0.0
        var streaks = 4
        var speed = (low: 0.0, high: 0.0)
        var scale = 1.0
        var lanes = (0.0, 0.0)
        var deep = (0.0, 0.0)
        var maxLife = 1
        var gap = (4.0, 10.0)
        var pace = 1.0
    }

    private struct Streak {
        var y = 0.0, length = 0.0, bow = 0.0, x0 = 0.0, travel = 0.0, peak = 0.0, width = 1.0
        var duration = 1.0, elapsed = 0.0
    }

    private enum Kind { case bobber, duck, fish }

    private struct Creature {
        var kind: Kind
        var direction: Double
        var from: Double, to: Double
        var x: Double
        var y: Double
        var drift: Double
        var speed: Double
        var size: Double
        var opacity = 1.0
        var upstream = false
        var wander: (amp: Double, waves: Double, phase: Double)?
        var bursts: [Double] = []
        var cycle: Double // the length of its own motion: a bob, a paddle or a tail beat
        var ownTime: Double
        var wakeCycle = 0.7
        var stroke: (start: Double, peak: Double, end: Double, duration: Double, peakAt: Double, time: Double)?
    }

    private var size = CGSize.zero
    private var geometry = Geometry()
    private var shallowPath = Path()
    private var waterPath = Path()
    private var foamPaths: [Path] = []
    private var foamOffset = 0.0
    private var streaks: [Streak] = []
    private var creatures: [Creature] = []
    private var lastTime: Double?
    private var current = 1.0
    private var nextSpawn = 0.0
    private static var nextSeed: UInt32 = 3
    private let seed: UInt32

    init() {
        seed = Self.nextSeed
        Self.nextSeed += 5
    }

    // MARK: Layout

    func layout(size newSize: CGSize) {
        guard newSize.width > 0, abs(newSize.width - size.width) >= 2 || newSize.height != size.height else { return }
        size = newSize
        let w = Double(size.width), h = Double(size.height)
        geometry = Geometry(
            bank: h * 0.115, amp: h * 0.067, shallow: h * 0.048,
            streaks: max(4, Int((w * h / 3400).rounded())),
            speed: (h * 0.25, h * 0.44),
            scale: h / 74,
            lanes: (h * 0.32, h * 0.73),
            deep: (h * 0.4, h * 0.62),
            maxLife: max(1, min(3, Int((w / 260).rounded()))),
            gap: h < 50 ? (7, 15) : (4, 10),
            pace: max(0.45, h / 104)
        )

        var random = SeededRandom(seed: seed)
        let phases = (0..<5).map { _ in random.next() * 6 }
        let step = max(8, min(16, w / 40))
        func edge(_ y0: Double, _ sign: Double, _ inset: Double) -> [CGPoint] {
            stride(from: 0, through: w + step, by: step).map { x in
                let wobble = sin(x / 97 + phases[sign > 0 ? 0 : 1]) * 0.6 + sin(x / 41 + phases[sign > 0 ? 2 : 3]) * 0.4
                let shallow = inset * (1 + 0.45 * sin(x / 63 + phases[4]))
                return CGPoint(x: x, y: y0 + sign * geometry.amp * wobble + sign * shallow)
            }
        }
        func body(_ inset: Double) -> Path {
            let top = edge(geometry.bank, 1, inset)
            let bottom = Array(edge(h - geometry.bank, -1, inset).reversed())
            var path = Path()
            path.move(to: top[0])
            addSmooth(top, to: &path)
            path.addLine(to: bottom[0])
            addSmooth(bottom, to: &path)
            path.closeSubpath()
            return path
        }
        shallowPath = body(-geometry.shallow)
        waterPath = body(geometry.shallow * 0.4)
        foamPaths = [(geometry.bank, 1.0), (h - geometry.bank, -1.0)].map { y0, sign in
            let points = edge(y0, sign, geometry.shallow * 0.4 + h * 0.03)
            var path = Path()
            path.move(to: points[0])
            addSmooth(points, to: &path)
            return path
        }

        streaks = (0..<geometry.streaks).map { _ in
            var streak = newStreak()
            streak.elapsed = streak.duration * Double.random(in: 0..<1)
            return streak
        }
        creatures = []
        spawn(head: true)
        nextSpawn = between(geometry.gap.0, geometry.gap.1)
    }

    /// As in a real river, the middle of the channel runs fastest and carries the longest streaks.
    private func newStreak() -> Streak {
        let w = Double(size.width), h = Double(size.height)
        let y = between(h * 0.24, h * 0.76)
        let t = (y - h / 2) / (h * 0.27)
        let f = max(0.3, 1 - 0.7 * t * t)
        let speed = geometry.speed.high * f * between(0.85, 1.15)
        let length = h * (0.2 + 0.45 * f) * between(0.8, 1.2)
        let travel = length * between(2.5, 5)
        return Streak(
            y: y,
            length: length,
            bow: h * 0.012 * between(0.4, 1.2) * (Bool.random() ? -1 : 1),
            x0: between(-length, max(-length, w - travel * 0.4)),
            travel: travel,
            peak: 0.22 + 0.36 * f,
            width: max(0.9, h * (0.012 + 0.014 * f)),
            duration: travel / speed
        )
    }

    /// The duck and bobbers float along the banks; fish swim under the surface, either way, and deeper ones are
    /// smaller and fainter. A creature already on the river when it first draws starts part-way across.
    private func spawn(head: Bool) {
        let w = Double(size.width), h = Double(size.height)
        let kind: Kind = [.bobber, .bobber, .duck, .fish, .fish].randomElement()!
        let upstream = kind == .fish && Bool.random()
        let baseSpeed: Double = switch kind {
        case .bobber: 1
        case .duck: 1.25
        case .fish: upstream ? 1.1 : 1.9
        }
        let direction = upstream ? -1.0 : 1.0
        let from = direction > 0 ? -30 : w + 30
        let to = direction > 0 ? w + 30 : -30
        let lane = Bool.random() ? geometry.lanes.0 : geometry.lanes.1
        let y = kind == .fish ? between(geometry.deep.0, geometry.deep.1) : lane + (Double.random(in: 0..<1) - 0.5) * h * 0.04
        let depth = Double.random(in: 0..<1)
        let cycle: Double = switch kind {
        case .bobber: between(3.8, 6.5)
        case .duck: 1.7
        case .fish: upstream ? between(0.21, 0.26) : between(0.36, 0.46)
        }
        var creature = Creature(
            kind: kind,
            direction: direction,
            from: from, to: to, x: from, y: y,
            drift: kind == .fish ? 0 : (Double.random(in: 0..<1) - 0.5) * h * 0.06,
            speed: baseSpeed * between(26, 34) * geometry.pace,
            size: geometry.scale * (kind == .fish ? 1.12 - depth * 0.3 : 1),
            opacity: kind == .fish ? 0.56 - depth * 0.28 : 1,
            upstream: upstream,
            cycle: cycle,
            ownTime: Double.random(in: 0..<10),
            wakeCycle: between(0.62, 0.76)
        )
        if kind == .fish {
            creature.wander = (min(h * 0.07, (geometry.deep.1 - geometry.deep.0) / 2), between(2, 3.5), Double.random(in: 0..<6))
            // Bursts and glides: each stretch of the crossing at its own speed.
            creature.bursts = (0..<14).map { _ in between(0.55, 1.6) }
        }
        if head { creature.x = from + (to - from) * between(0.15, 0.55) }
        creatures.append(creature)
    }

    // MARK: Motion

    func advance(to time: Double, current target: Double) {
        guard size.width > 0 else { return }
        let dt = min(max(time - (lastTime ?? time), 0), 0.1)
        lastTime = time
        current += (target - current) * min(1, dt * 5)

        foamOffset += geometry.speed.low * 0.35 * dt * current
        for i in streaks.indices {
            streaks[i].elapsed += dt * current
            if streaks[i].elapsed >= streaks[i].duration { streaks[i] = newStreak() }
        }

        for i in creatures.indices {
            var creature = creatures[i]
            // Fish heading upstream work harder as the current picks up; everything else keeps its own pace.
            creature.ownTime += dt * (creature.upstream ? 1 + (current - 1) * 0.3 : 1)
            if creature.upstream {
                swimUpstream(&creature, dt: dt)
            } else {
                var speed = creature.speed
                if !creature.bursts.isEmpty {
                    let progress = (creature.x - creature.from) / (creature.to - creature.from)
                    speed *= creature.bursts[min(13, max(0, Int(progress * 14)))]
                }
                // Carried along, so it travels faster when the current picks up.
                creature.x += creature.direction * speed * dt * current
            }
            creatures[i] = creature
        }
        creatures.removeAll { ($0.to - $0.x) * $0.direction <= 0 }

        nextSpawn -= dt
        if nextSpawn <= 0 {
            if creatures.count < geometry.maxLife { spawn(head: false) }
            nextSpawn = between(geometry.gap.0, geometry.gap.1)
        }
    }

    /// Against the current a fish swims in strokes: a lunge upstream, then a slide back as the current takes it,
    /// nose still upstream. Each stroke reads the current as it starts, so in a stronger current the fish is
    /// pushed back further and gains less, though it still gets there.
    private func swimUpstream(_ creature: inout Creature, dt: Double) {
        if creature.stroke == nil {
            let stretch = abs(creature.to - creature.from) / 14 * between(0.8, 1.2)
            let duration = stretch / (creature.speed * between(0.55, 1.6))
            let slip = Double.random(in: 0..<1) < 0.2 / current ? 0 : between(0.22, 0.42)
            let lunge = stretch * (1 + slip) * (1 + 0.12 * (current - 1))
            let back = stretch * slip * pow(current, 1.3)
            let peak = creature.x + creature.direction * lunge
            creature.stroke = (creature.x, peak, peak - creature.direction * back, duration, slip > 0 ? between(0.38, 0.48) : 1, 0)
        }
        guard var stroke = creature.stroke else { return }
        stroke.time = min(stroke.time + dt, stroke.duration)
        let t = stroke.time / stroke.duration
        if t <= stroke.peakAt {
            let local = t / stroke.peakAt
            creature.x = stroke.start + (stroke.peak - stroke.start) * (1 - pow(1 - local, 3))
        } else {
            let local = (t - stroke.peakAt) / (1 - stroke.peakAt)
            creature.x = stroke.peak + (stroke.end - stroke.peak) * local * local * (3 - 2 * local)
        }
        creature.stroke = t >= 1 ? nil : stroke
    }

    // MARK: Drawing

    func draw(in context: inout GraphicsContext, focused: Bool) {
        let w = Double(size.width), h = Double(size.height)
        context.fill(shallowPath, with: .color(focused ? Theme.accent : Theme.shallow))
        context.fill(waterPath, with: .linearGradient(
            Gradient(stops: [.init(color: Theme.water, location: 0), .init(color: Theme.waterDeep, location: 0.5), .init(color: Theme.water, location: 1)]),
            startPoint: .zero, endPoint: CGPoint(x: 0, y: h)
        ))

        // Foam: a faint broken line just inside each bank, drifting slowly.
        let k = h / 104
        for path in foamPaths {
            context.stroke(path, with: .color(.white.opacity(0.16)), style: StrokeStyle(
                lineWidth: max(0.8, h * 0.012), lineCap: .round,
                dash: [2, 7, 9, 22].map { $0 * k }, dashPhase: -foamOffset
            ))
        }

        // A streak is a short tapered glint that fades in, drifts and fades out.
        for streak in streaks {
            let p = streak.elapsed / streak.duration
            let opacity = p < 0.25 ? streak.peak * p / 0.25 : p > 0.7 ? streak.peak * (1 - p) / 0.3 : streak.peak
            var layer = context
            layer.opacity = opacity
            layer.translateBy(x: streak.x0 + streak.travel * p, y: streak.y + streak.bow * 0.6 * p)
            var path = Path()
            path.move(to: .zero)
            path.addQuadCurve(to: CGPoint(x: streak.length, y: 0), control: CGPoint(x: streak.length / 2, y: streak.bow))
            layer.stroke(path, with: .linearGradient(
                Gradient(stops: [.init(color: .white.opacity(0), location: 0), .init(color: .white, location: 0.4), .init(color: .white, location: 0.6), .init(color: .white.opacity(0), location: 1)]),
                startPoint: .zero, endPoint: CGPoint(x: streak.length, y: 0)
            ), style: StrokeStyle(lineWidth: streak.width, lineCap: .round))
        }

        // Calm water behind the text, so glints dim as they pass behind the words. Creatures still swim over it.
        context.drawLayer { layer in
            layer.opacity = 0.82
            let rect = Path(CGRect(x: 0, y: 0, width: w, height: h))
            layer.fill(rect, with: .linearGradient(
                Gradient(stops: [
                    .init(color: Theme.waterDeep.opacity(0), location: 0.12), .init(color: Theme.waterDeep, location: 0.38),
                    .init(color: Theme.waterDeep, location: 0.62), .init(color: Theme.waterDeep.opacity(0), location: 0.88),
                ]),
                startPoint: .zero, endPoint: CGPoint(x: 0, y: h)
            ))
            layer.blendMode = .destinationIn
            layer.fill(rect, with: .linearGradient(
                Gradient(stops: [.init(color: .white, location: 0.7), .init(color: .white.opacity(0), location: 1)]),
                startPoint: .zero, endPoint: CGPoint(x: w, y: 0)
            ))
        }

        for creature in creatures { draw(creature, in: context) }
    }

    private func wanderY(_ creature: Creature, at x: Double) -> Double {
        guard let wander = creature.wander else {
            return creature.y + creature.drift * (x - creature.from) / (creature.to - creature.from)
        }
        let angle = (x - creature.from) / (creature.to - creature.from) * wander.waves * .pi + wander.phase
        return min(geometry.deep.1, max(geometry.deep.0, creature.y + wander.amp * sin(angle)))
    }

    private func draw(_ creature: Creature, in context: GraphicsContext) {
        var layer = context
        layer.translateBy(x: creature.x, y: wanderY(creature, at: creature.x))
        if creature.kind == .fish {
            // Nose turned toward where it is heading.
            let slope = (wanderY(creature, at: creature.x + 1) - wanderY(creature, at: creature.x - 1)) / 2
            layer.rotate(by: .radians(atan(slope)))
        }
        layer.scaleBy(x: creature.direction * creature.size, y: creature.size)
        switch creature.kind {
        case .bobber: drawBobber(creature, in: layer)
        case .duck: drawDuck(creature, in: layer)
        case .fish: drawFish(creature, in: layer)
        }
    }

    /// Bobbers rock on the current; now and then a bite taps them, pulls them under, and they pop back up. The body
    /// is drawn twice, clipped at the waterline: solid above, faint below, so the red cap really goes under.
    private func drawBobber(_ creature: Creature, in context: GraphicsContext) {
        let t = creature.ownTime.truncatingRemainder(dividingBy: creature.cycle) / creature.cycle
        let motion = keyframe([
            [0, 0, -4], [0.3, 0.4, 4], [0.6, 0, -4], [0.68, 0, -2], [0.7, 1.4, 0], [0.73, 0, -1], [0.76, 6.5, 2],
            [0.81, 5.8, -1], [0.855, -2, -3], [0.9, 0.9, 2], [0.94, -0.4, -3], [1, 0, -4],
        ], at: t)
        let wake = keyframe([[0, 1, 0.28], [0.73, 1, 0.28], [0.78, 1.35, 0.55], [0.9, 1.9, 0], [0.92, 1, 0], [1, 1, 0.28]], at: t)

        func body(_ context: GraphicsContext) {
            var body = context
            body.translateBy(x: 0, y: motion[0])
            body.rotate(by: .degrees(motion[1]))
            let cream = Color(red: 0.957, green: 0.945, blue: 0.918)
            var low = Path()
            low.addArc(center: .zero, radius: 6, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: true)
            low.closeSubpath()
            var top = Path()
            top.addArc(center: .zero, radius: 6, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
            top.closeSubpath()
            body.fill(low, with: .color(cream))
            body.fill(top, with: .color(Color(red: 0.851, green: 0.220, blue: 0.173)))
            body.stroke(Path { $0.move(to: CGPoint(x: -6, y: 0)); $0.addLine(to: CGPoint(x: 6, y: 0)) },
                        with: .color(Color(red: 0.165, green: 0.102, blue: 0.090).opacity(0.55)), lineWidth: 0.8)
            body.fill(Path(roundedRect: CGRect(x: -0.9, y: -10.5, width: 1.8, height: 5), cornerRadius: 0.9), with: .color(cream))
            body.fill(Path(ellipseIn: CGRect(x: -3.9, y: -4.2, width: 3.2, height: 2)), with: .color(.white.opacity(0.5)))
        }

        var under = context
        under.clip(to: Path(CGRect(x: -20, y: 1.5, width: 40, height: 20)))
        under.opacity = 0.3
        body(under)

        var ring = context
        ring.translateBy(x: 0, y: 1.8)
        ring.scaleBy(x: wake[0], y: wake[0])
        ring.stroke(Path(ellipseIn: CGRect(x: -9.5, y: -2.4, width: 19, height: 4.8)), with: .color(.white.opacity(wake[1])), lineWidth: 1.2)

        var above = context
        above.clip(to: Path(CGRect(x: -20, y: -30, width: 40, height: 31.5)))
        body(above)
    }

    private func drawDuck(_ creature: Creature, in context: GraphicsContext) {
        let swing = sin(creature.ownTime / creature.cycle * .pi)
        var duck = context
        duck.translateBy(x: 0, y: -1 + swing * 0.8)
        duck.rotate(by: .degrees(-0.5 + swing * 2.5))
        duck.translateBy(x: 0, y: 1)

        func path(_ build: (inout Path) -> Void) -> Path { var path = Path(); build(&path); return path }
        func point(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x, y: y) }

        duck.stroke(path { $0.move(to: point(-17, 5)); $0.addQuadCurve(to: point(5, 6), control: point(-7, 9)) },
                    with: .color(.white.opacity(0.28)), style: StrokeStyle(lineWidth: 1.2, lineCap: .round))
        duck.fill(path {
            $0.move(to: point(-12, 1))
            $0.addCurve(to: point(6, -4), control1: point(-12, -6), control2: point(-2, -7))
            $0.addCurve(to: point(9, 4), control1: point(10, -3), control2: point(11, 1))
            $0.addCurve(to: point(-12, 1), control1: point(4, 7), control2: point(-8, 7))
            $0.closeSubpath()
        }, with: .color(Color(red: 0.639, green: 0.565, blue: 0.475)))
        duck.fill(path { $0.addLines([point(-12, 0), point(-15.5, -4.5), point(-10, -2.2)]); $0.closeSubpath() },
                  with: .color(Color(red: 0.231, green: 0.212, blue: 0.192)))
        duck.fill(path {
            $0.move(to: point(-7, -1))
            $0.addCurve(to: point(4, 0), control1: point(-3, -4), control2: point(3, -3.4))
            $0.addCurve(to: point(-7, -1), control1: point(0, 2), control2: point(-5, 2))
            $0.closeSubpath()
        }, with: .color(Color(red: 0.494, green: 0.424, blue: 0.345)))
        duck.fill(Path(ellipseIn: CGRect(x: 2.4, y: -12.6, width: 9.2, height: 9.2)), with: .color(Color(red: 0.184, green: 0.431, blue: 0.306)))
        duck.stroke(path { $0.move(to: point(3.6, -4.4)); $0.addLine(to: point(9, -4.2)) },
                    with: .color(Color(red: 0.957, green: 0.945, blue: 0.918)), style: StrokeStyle(lineWidth: 1.3, lineCap: .round))
        duck.fill(path { $0.addLines([point(11, -8.6), point(15.6, -7.4), point(11, -6.2)]); $0.closeSubpath() },
                  with: .color(Color(red: 0.914, green: 0.643, blue: 0.235)))
        duck.fill(Path(ellipseIn: CGRect(x: 7.7, y: -10.1, width: 1.8, height: 1.8)), with: .color(.black))
    }

    /// The tail swings and the body flexes the other way. Against the current the tail beats faster and wider,
    /// and water parts at the nose and slides back along the body.
    private func drawFish(_ creature: Creature, in context: GraphicsContext) {
        let swing = sin(creature.ownTime / creature.cycle * .pi)
        let fill = Color(red: 0.008, green: 0.122, blue: 0.141).opacity(creature.opacity)
        func point(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x, y: y) }

        if creature.upstream {
            let t = creature.ownTime.truncatingRemainder(dividingBy: creature.wakeCycle) / creature.wakeCycle
            let opacity = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75
            var wake = context
            wake.translateBy(x: 13 + (1.5 - 6.5 * t), y: 0)
            wake.scaleBy(x: 1, y: 0.7 + 0.45 * t)
            wake.translateBy(x: -13, y: 0)
            var lines = Path()
            lines.move(to: point(13, -1)); lines.addQuadCurve(to: point(2.5, -5.8), control: point(9, -4.4))
            lines.move(to: point(13, 1)); lines.addQuadCurve(to: point(2.5, 5.8), control: point(9, 4.4))
            wake.stroke(lines, with: .color(.white.opacity(creature.opacity * 0.75 * opacity)), style: StrokeStyle(lineWidth: 0.7, lineCap: .round))
        }

        let tailAngle = (creature.upstream ? 24.0 : 17.0) * swing
        var tail = context
        tail.translateBy(x: -9.5, y: 0)
        tail.rotate(by: .degrees(tailAngle))
        tail.translateBy(x: 9.5, y: 0)
        var tailPath = Path()
        tailPath.move(to: point(-9.5, 0))
        tailPath.addLine(to: point(-16.5, -5.2))
        tailPath.addQuadCurve(to: point(-16.5, 5.2), control: point(-14.4, 0))
        tailPath.closeSubpath()
        tail.fill(tailPath, with: .color(fill))

        var body = context
        body.rotate(by: .degrees(-(creature.upstream ? 4.5 : 3) * swing))
        var bodyPath = Path()
        bodyPath.move(to: point(11, 0))
        bodyPath.addCurve(to: point(-2, -3.6), control1: point(9.6, -3), control2: point(4, -4.2))
        bodyPath.addCurve(to: point(-10.4, 0), control1: point(-6, -3.1), control2: point(-8.8, -1.8))
        bodyPath.addCurve(to: point(-2, 3.6), control1: point(-8.8, 1.8), control2: point(-6, 3.1))
        bodyPath.addCurve(to: point(11, 0), control1: point(4, 4.2), control2: point(9.6, 3))
        bodyPath.closeSubpath()
        bodyPath.addLines([point(3.6, -3.5), point(-0.4, -6.8), point(-1.8, -3.6)])
        bodyPath.closeSubpath()
        bodyPath.addLines([point(3.6, 3.5), point(-0.4, 6.8), point(-1.8, 3.6)])
        bodyPath.closeSubpath()
        body.fill(bodyPath, with: .color(fill))
    }
}
