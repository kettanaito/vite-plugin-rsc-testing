import { CreateNoteButton } from './client'

export default function Server() {
  async function createNoteAction() {
    'use server'
    console.log('SERVER ACTION!')
  }

  return <CreateNoteButton onClick={createNoteAction} />
}
