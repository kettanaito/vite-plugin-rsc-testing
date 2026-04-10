import { Expandable } from './client'

const notes = [
  {
    id: 1,
    title: 'First note',
    content: 'Hello world',
  },
]

export default function Notes() {
  return (
    <ul>
      {notes.map((note) => (
        <li key={note.id}>
          <h2>{note.title}</h2>
          <Expandable>
            <p>{note.content}</p>
          </Expandable>
        </li>
      ))}
    </ul>
  )
}
