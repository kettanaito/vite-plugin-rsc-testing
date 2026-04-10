'use client'

import { createNote } from './actions'

export function CreateNoteForm() {
  return (
    <form action={createNote}>
      <label>
        Title
        <input name="title" />
      </label>
      <button>Create note</button>
    </form>
  )
}
