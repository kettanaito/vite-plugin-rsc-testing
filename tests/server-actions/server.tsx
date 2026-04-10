import { CreateNoteButton } from './client'

const notes: Array<{ id: number; title: string }> = []

export default function Server() {
  async function createNoteAction() {
    'use server'

    notes.push({
      id: notes.length,
      title: 'New Note',
    })
  }

  return (
    <div>
      <ul>
        {notes.map((note) => (
          <li key={note.id}>{note.title}</li>
        ))}
      </ul>
      <CreateNoteButton onClick={createNoteAction} />
    </div>
  )
}
