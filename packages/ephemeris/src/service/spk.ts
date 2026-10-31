import { Array, Effect } from "effect"
import { KernelFormatError, type KernelReadError } from "../types/errors.js"
import type { RangeReader } from "../types/kernel.js"

export type { RangeReader } from "../types/kernel.js"

/** One segment from the table of contents of a JPL SPK file; docs/references/naif-spk.md has the layout. */
export interface SpkSegment {
  readonly target: number
  readonly center: number
  readonly dataType: 2 | 3
  readonly initSeconds: number
  readonly intervalSeconds: number
  readonly recordCount: number
  /** Doubles per record: MID, RADIUS, then the coefficients for every stored component. */
  readonly recordWords: number
  readonly coefficientsPerAxis: number
  readonly dataByteOffset: number
}

const RECORD_BYTES = 1024
const DOUBLE_BYTES = 8
const SPK_DOUBLES_PER_SUMMARY = 5
const FOOTER_WORDS = 4

const readExactly = Effect.fnUntraced(function* (
  reader: RangeReader,
  offset: number,
  length: number,
): Effect.fn.Return<DataView, KernelReadError | KernelFormatError> {
  const bytes = yield* reader.read(offset, length)
  if (bytes.length < length) {
    return yield* new KernelFormatError({
      message: `The file ended early: wanted ${String(length)} bytes at ${String(offset)}, got ${String(bytes.length)}.`,
    })
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
})

const textAt = (view: DataView, offset: number, length: number): string =>
  String.fromCharCode(...Array.makeBy(length, (index) => view.getUint8(offset + index)))

interface SummaryEntry {
  readonly target: number
  readonly center: number
  readonly dataType: number
  readonly startWord: number
  readonly endWord: number
}

const summariesIn = (view: DataView): ReadonlyArray<SummaryEntry> =>
  Array.makeBy(Math.max(view.getFloat64(16, true), 0), (index) => {
    const base = 24 + index * SPK_DOUBLES_PER_SUMMARY * DOUBLE_BYTES
    return {
      target: view.getInt32(base + 16, true),
      center: view.getInt32(base + 20, true),
      dataType: view.getInt32(base + 28, true),
      startWord: view.getInt32(base + 32, true),
      endWord: view.getInt32(base + 36, true),
    }
  })

const readSummaryChain: (
  reader: RangeReader,
  recordNumber: number,
  collected: ReadonlyArray<SummaryEntry>,
) => Effect.Effect<ReadonlyArray<SummaryEntry>, KernelReadError | KernelFormatError> =
  Effect.fnUntraced(function* (reader, recordNumber, collected) {
    const view = yield* readExactly(reader, (recordNumber - 1) * RECORD_BYTES, RECORD_BYTES)
    const entries = [...collected, ...summariesIn(view)]
    const next = view.getFloat64(0, true)
    if (next === 0) return entries
    if (next <= recordNumber) {
      return yield* new KernelFormatError({
        message: `Summary record ${String(recordNumber)} points back to record ${String(next)}.`,
      })
    }
    return yield* readSummaryChain(reader, next, entries)
  })

const readSegment = Effect.fnUntraced(function* (
  reader: RangeReader,
  entry: SummaryEntry,
): Effect.fn.Return<SpkSegment, KernelReadError | KernelFormatError> {
  const { dataType } = entry
  if (dataType !== 2 && dataType !== 3) {
    return yield* new KernelFormatError({
      message: `Segment ${String(entry.center)} -> ${String(entry.target)} is SPK type ${String(dataType)}; this reader handles types 2 and 3.`,
    })
  }
  const footerOffset = (entry.endWord - FOOTER_WORDS) * DOUBLE_BYTES
  const footer = yield* readExactly(reader, footerOffset, FOOTER_WORDS * DOUBLE_BYTES)
  const recordWords = footer.getFloat64(16, true)
  const componentsPerCoefficient = dataType === 2 ? 3 : 6
  return {
    target: entry.target,
    center: entry.center,
    dataType,
    initSeconds: footer.getFloat64(0, true),
    intervalSeconds: footer.getFloat64(8, true),
    recordCount: footer.getFloat64(24, true),
    recordWords,
    coefficientsPerAxis: (recordWords - 2) / componentsPerCoefficient,
    dataByteOffset: (entry.startWord - 1) * DOUBLE_BYTES,
  }
})

/** Lists every segment in the file, in file order, without reading any coefficients. */
export const readSpkSegments = Effect.fn("Spk.readSegments")(function* (
  reader: RangeReader,
): Effect.fn.Return<ReadonlyArray<SpkSegment>, KernelReadError | KernelFormatError> {
  const fileRecord = yield* readExactly(reader, 0, RECORD_BYTES)
  const idWord = textAt(fileRecord, 0, 8)
  if (idWord !== "DAF/SPK ") {
    return yield* new KernelFormatError({ message: `Not an SPK file: its ID word is "${idWord}".` })
  }
  const format = textAt(fileRecord, 88, 8)
  if (format !== "LTL-IEEE") {
    return yield* new KernelFormatError({
      message: `The file's numbers are stored as ${format}; this reader handles LTL-IEEE only.`,
    })
  }
  const entries = yield* readSummaryChain(reader, fileRecord.getInt32(76, true), [])
  return yield* Effect.forEach(entries, (entry) => readSegment(reader, entry))
})
