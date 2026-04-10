'use server'

export const notes: Array<{ id: number; title: string }> = []

export async function createNote(formData: FormData) {
  const title = formData.get('title')

  if (typeof title !== 'string') {
    throw new Error('Invalid note "title"')
  }

  notes.push({
    id: notes.length,
    title,
  })
}
