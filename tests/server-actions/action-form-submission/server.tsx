import { notes } from './actions'
import { CreateNoteForm } from './client'

export default function Server() {
  return (
    <div>
      <ul>
        {notes.map((note) => (
          <li key={note.id}>{note.title}</li>
        ))}
      </ul>
      <CreateNoteForm />
    </div>
  )
}
