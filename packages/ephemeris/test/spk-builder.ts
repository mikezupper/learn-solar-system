/**
 * Builds a small, valid SPK file in memory, following NAIF's DAF Required Reading. Tests use it to
 * exercise the reader on layouts the real kernels contain, such as chained summary records,
 * without downloading 33 MB.
 */
export interface TestSegment {
  readonly target: number
  readonly center: number
  readonly dataType: 2 | 3
  readonly initSeconds: number
  readonly intervalSeconds: number
  /** One entry per record, in order. Each holds the coefficients only, without MID and RADIUS. */
  readonly records: ReadonlyArray<ReadonlyArray<number>>
}

const RECORD_BYTES = 1024
const DOUBLE_BYTES = 8
const DOUBLES_PER_RECORD = RECORD_BYTES / DOUBLE_BYTES
const SUMMARY_DOUBLES = 5

export const buildSpk = (
  segments: ReadonlyArray<TestSegment>,
  options: {
    readonly idWord?: string
    readonly format?: string
    readonly summariesPerRecord?: number
  } = {},
): Uint8Array => {
  const perRecord = options.summariesPerRecord ?? 25
  const summaryRecordCount = Math.max(1, Math.ceil(segments.length / perRecord))
  // Layout: file record, then a (summary, name) record pair per batch, then the data.
  const firstDataRecord = 2 + summaryRecordCount * 2
  const dataWords = segments.flatMap((segment) => {
    const coefficientCount = segment.records[0]?.length ?? 0
    const recordSize = coefficientCount + 2
    return [
      ...segment.records.flatMap((record, index) => [
        segment.initSeconds + (index + 0.5) * segment.intervalSeconds,
        segment.intervalSeconds / 2,
        ...record,
      ]),
      segment.initSeconds,
      segment.intervalSeconds,
      recordSize,
      segment.records.length,
    ]
  })
  const totalBytes = (firstDataRecord - 1) * RECORD_BYTES + dataWords.length * DOUBLE_BYTES
  const bytes = new Uint8Array(totalBytes)
  const view = new DataView(bytes.buffer)
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i)
  }

  writeText(0, options.idWord ?? "DAF/SPK ")
  view.setInt32(8, 2, true) // ND
  view.setInt32(12, 6, true) // NI
  view.setInt32(76, 2, true) // FWARD: the first summary record
  writeText(88, options.format ?? "LTL-IEEE")

  let wordAddress = (firstDataRecord - 1) * DOUBLES_PER_RECORD + 1
  const addressed = segments.map((segment) => {
    const coefficientCount = segment.records[0]?.length ?? 0
    const words = segment.records.length * (coefficientCount + 2) + 4
    const start = wordAddress
    wordAddress += words
    return { segment, start, end: start + words - 1 }
  })

  for (let batch = 0; batch < summaryRecordCount; batch += 1) {
    const offset = (1 + batch * 2) * RECORD_BYTES
    const inBatch = addressed.slice(batch * perRecord, (batch + 1) * perRecord)
    const next = batch + 1 < summaryRecordCount ? 2 + (batch + 1) * 2 : 0
    view.setFloat64(offset, next, true)
    view.setFloat64(offset + 8, batch === 0 ? 0 : 2 + (batch - 1) * 2, true)
    view.setFloat64(offset + 16, inBatch.length, true)
    inBatch.forEach(({ segment, start, end }, index) => {
      const base = offset + 24 + index * SUMMARY_DOUBLES * DOUBLE_BYTES
      const span = segment.records.length * segment.intervalSeconds
      view.setFloat64(base, segment.initSeconds, true)
      view.setFloat64(base + 8, segment.initSeconds + span, true)
      view.setInt32(base + 16, segment.target, true)
      view.setInt32(base + 20, segment.center, true)
      view.setInt32(base + 24, 1, true) // frame: J2000
      view.setInt32(base + 28, segment.dataType, true)
      view.setInt32(base + 32, start, true)
      view.setInt32(base + 36, end, true)
    })
  }

  dataWords.forEach((word, index) => {
    view.setFloat64((firstDataRecord - 1) * RECORD_BYTES + index * DOUBLE_BYTES, word, true)
  })
  return bytes
}
