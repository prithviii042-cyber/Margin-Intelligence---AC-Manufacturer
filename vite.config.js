import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function loadDotEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
    const vars = {}
    for (const line of text.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) vars[m[1].trim()] = m[2].trim()
    }
    return vars
  } catch { return {} }
}

function llmProxy() {
  const env = loadDotEnv()
  const apiKey = env.API_KEY
  const baseUrl = env.API_ENDPOINT
  const apiPath = env.API_PATH
  const apiVersion = env.API_VERSION
  const authHeader = env.API_AUTH_HEADER || 'api-key'
  const model = env.MODEL || 'gpt-5'

  const fullUrl = `${baseUrl}${apiPath}?api-version=${apiVersion}`

  return {
    name: 'llm-api-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/api/llm' || req.method !== 'POST') {
          return next()
        }

        if (!apiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'API_KEY not set in .env' }))
          return
        }

        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', async () => {
          const body = JSON.parse(Buffer.concat(chunks).toString())

          const openAiBody = {
            model,
            max_completion_tokens: 4096,
            messages: [
              ...(body.system ? [{ role: 'system', content: body.system }] : []),
              ...body.messages,
            ],
          }

          // Return SSE — matches Netlify Edge Function format
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          })

          // Keepalive heartbeats every 15s
          const keepalive = setInterval(() => {
            try { res.write(': keepalive\n\n') } catch { clearInterval(keepalive) }
          }, 15000)

          try {
            console.log(`[llm-proxy] → ${fullUrl}`)
            const response = await fetch(fullUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                [authHeader]: apiKey,
              },
              body: JSON.stringify(openAiBody),
            })

            const data = await response.text()
            console.log(`[llm-proxy] ← ${response.status}`)

            if (!response.ok) {
              res.write(`data: ${JSON.stringify({ error: data })}\n\n`)
            } else {
              res.write(`data: ${data}\n\n`)
            }
          } catch (e) {
            console.error('[llm-proxy] fetch error:', e.cause || e)
            res.write(`data: ${JSON.stringify({ error: e.cause?.message || e.message })}\n\n`)
          } finally {
            clearInterval(keepalive)
            res.end()
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), llmProxy()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
