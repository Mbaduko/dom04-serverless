import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert, Button, Card, Flex, Heading, Link, Loader, Table, TableBody, TableCell, TableHead, TableRow, Text,
} from '@aws-amplify/ui-react'
import { api } from '../api'
import { formatDate } from '../format'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = 'image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx'

const formatSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export default function AttachmentsPanel({ task, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState(null)
  const fileInput = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems((await api.listAttachments(task.taskId)).items)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setLoading(false)
    }
  }, [task.taskId])

  useEffect(() => { load() }, [load])

  const upload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) {
      setMessage({ type: 'error', text: 'Files must be 10 MB or smaller' })
      return
    }
    setBusy('upload')
    setMessage(null)
    try {
      await api.uploadAttachment(task.taskId, file)
      setMessage({ type: 'success', text: `Uploaded ${file.name}` })
      await load()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setBusy(null)
    }
  }

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.fileName}"?`)) return
    setBusy(item.attachmentId)
    setMessage(null)
    try {
      await api.deleteAttachment(task.taskId, item.attachmentId)
      setItems((current) => current.filter((i) => i.attachmentId !== item.attachmentId))
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card variation="outlined">
      <Flex direction="column" gap="small">
        <Flex justifyContent="space-between" alignItems="center" wrap="wrap" gap="small">
          <Heading level={5}>Attachments: {task.title}</Heading>
          <Flex gap="xs">
            <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={upload} />
            <Button size="small" variation="primary" isLoading={busy === 'upload'} onClick={() => fileInput.current.click()}>
              Upload file
            </Button>
            <Button size="small" onClick={onClose}>Close</Button>
          </Flex>
        </Flex>
        <Text fontSize="small" color="font.secondary">Images, PDF, Word, Excel, text or CSV, up to 10 MB.</Text>

        {message && (
          <Alert variation={message.type} isDismissible onDismiss={() => setMessage(null)}>{message.text}</Alert>
        )}

        {loading ? (
          <Loader variation="linear" />
        ) : items.length === 0 ? (
          <Text color="font.tertiary">No files attached yet.</Text>
        ) : (
          <div className="table-scroll">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell as="th">File</TableCell>
                  <TableCell as="th">Size</TableCell>
                  <TableCell as="th">Uploaded</TableCell>
                  <TableCell as="th" />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.attachmentId}>
                    <TableCell><Link href={item.downloadUrl}>{item.fileName}</Link></TableCell>
                    <TableCell>{formatSize(item.size)}</TableCell>
                    <TableCell>{formatDate(item.uploadedAt)}</TableCell>
                    <TableCell>
                      <Button size="small" colorTheme="error" isLoading={busy === item.attachmentId} onClick={() => remove(item)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Flex>
    </Card>
  )
}
