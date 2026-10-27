import rehypePrismGenerator from 'rehype-prism-plus/generator'
import { refractor } from 'refractor/core'
import json from 'refractor/json'

// Register only JSON. The default entry points bundle every Prism grammar, which each
// launch would parse for an editor that only ever highlights JSON.
refractor.register(json)

export const rehypePrismJson = rehypePrismGenerator(refractor)
