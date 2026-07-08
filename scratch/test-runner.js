require('ts-node/register')
const { POST } = require('../src/app/api/staff-portal/enroll/route.ts')

// Mock NextRequest
const req = {
  json: async () => ({ staffId: '1fff69b8-37ad-44d4-9e3d-271552386ba1', action: 'enroll' }),
  headers: new Map(),
  url: 'http://localhost:3000/api/staff-portal/enroll'
}

console.log('Starting test...')
POST(req)
  .then(res => {
    console.log('Status:', res.status)
    return res.json()
  })
  .then(json => {
    console.log('Response JSON:', json)
  })
  .catch(err => {
    console.error('Unhandled Error:', err)
  })
