import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import associateHandler from '../api/associate.js'
import generateHandler from '../api/generate.js'

const app = express()
app.use(cors())
app.use(express.json())

app.post('/api/associate', associateHandler)
app.post('/api/generate', generateHandler)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`后端代理已启动: http://localhost:${PORT}`)
})
