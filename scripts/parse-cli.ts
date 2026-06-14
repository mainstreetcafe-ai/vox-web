// Regex fast-path bridge for the Vox eval harness (Workstream B self-improvement loop).
// Runs the REAL production parser (commandParser.ts) so the harness measures the
// exact regex behavior the app ships -- no port, no drift. Reads one utterance per
// line on stdin, writes a JSON array of {transcript, intent, entities, confidence}.
// Run with: node --experimental-strip-types scripts/parse-cli.ts < utterances.txt
import { parseCommand } from '../src/services/commandParser.ts'
import * as readline from 'node:readline'

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const out: Array<Record<string, unknown>> = []
rl.on('line', (line) => {
  const t = line.trim()
  if (!t) return
  const p = parseCommand(t)
  out.push({ transcript: t, intent: p.intent, entities: p.entities, confidence: p.confidence })
})
rl.on('close', () => process.stdout.write(JSON.stringify(out)))
