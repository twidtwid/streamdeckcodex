import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: swift scripts/ocr-image.swift <image>\n", stderr)
    exit(2)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard
    let image = NSImage(contentsOf: imageURL),
    let data = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: data),
    let cgImage = bitmap.cgImage
else {
    fputs("Could not load image: \(imageURL.path)\n", stderr)
    exit(2)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.minimumTextHeight = 0.006

do {
    try VNImageRequestHandler(cgImage: cgImage).perform([request])
    let text = (request.results ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")
    print(text)
} catch {
    fputs("OCR failed: \(error)\n", stderr)
    exit(1)
}
