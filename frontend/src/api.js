import { fetchAuthSession } from 'aws-amplify/auth'

let baseUrl = ''

export const setApiUrl = (url) => {
  baseUrl = url
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function getSessionInfo() {
  const { tokens } = await fetchAuthSession()
  const payload = tokens?.idToken?.payload ?? {}
  const groups = payload['cognito:groups'] ?? []
  return {
    sub: payload.sub,
    email: payload.email,
    isAdmin: groups.includes('Admin'),
  }
}

async function request(method, path, { body, query } = {}) {
  const { tokens } = await fetchAuthSession()
  const params = new URLSearchParams(
    Object.entries(query ?? {}).filter(([, value]) => value !== undefined && value !== ''),
  )
  const url = `${baseUrl}${path}${params.size ? `?${params}` : ''}`

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: tokens?.idToken?.toString() ?? '',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) return null

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error?.code ?? 'REQUEST_FAILED',
      data.error?.message ?? data.message ?? `Request failed (${response.status})`,
    )
  }
  return data
}

// Sends the file straight to S3 using the presigned POST ticket from the API (no auth header needed)
async function uploadToS3({ url, fields }, file) {
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => form.append(key, value))
  form.append('file', file)
  const response = await fetch(url, { method: 'POST', body: form })
  if (!response.ok) throw new ApiError(response.status, 'UPLOAD_FAILED', 'Upload to storage failed')
}

export const api = {
  listTasks: (query) => request('GET', '/tasks', { query }),
  getTask: (taskId) => request('GET', `/tasks/${taskId}`),
  createTask: (task) => request('POST', '/tasks', { body: task }),
  updateTask: (taskId, changes) => request('PUT', `/tasks/${taskId}`, { body: changes }),
  deleteTask: (taskId) => request('DELETE', `/tasks/${taskId}`),
  assignTask: (taskId, userId) => request('POST', `/tasks/${taskId}/assign`, { body: { userId } }),
  notifyTask: (taskId) => request('POST', `/tasks/${taskId}/notify`),
  listAttachments: (taskId) => request('GET', `/tasks/${taskId}/attachments`),
  deleteAttachment: (taskId, attachmentId) => request('DELETE', `/tasks/${taskId}/attachments/${attachmentId}`),
  uploadAttachment: async (taskId, file) => {
    const ticket = await request('POST', `/tasks/${taskId}/attachments`, {
      body: { fileName: file.name, contentType: file.type, size: file.size },
    })
    await uploadToS3(ticket.upload, file)
    return ticket
  },
  listUsers: (query) => request('GET', '/users', { query }),
  createUser: (user) => request('POST', '/users', { body: user }),
  subscribeUser: (userId) => request('POST', `/users/${userId}/subscription`),
}
