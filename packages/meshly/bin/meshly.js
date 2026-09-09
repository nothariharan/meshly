#!/usr/bin/env node
import { runCli } from "@meshly/cli"

await runCli(process.argv.slice(2))
