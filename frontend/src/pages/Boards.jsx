import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'

import {
  NEW_BOARD_NAME,
  addPanel,
  createBoard,
  followSymbol,
  loadBoards,
  saveBoards,
} from '../lib/boards'
import BoardGrid from '../components/boards/BoardGrid'
import PanelLibrary from '../components/boards/PanelLibrary'
import { Button, Card, Input } from '../components/ui'
import ResearchChart from './ResearchChart'

const TAB =
  'inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-[10px] text-[15px] font-bold whitespace-nowrap transition-colors'
const tabClass = ({ isActive }) => `${TAB} ${isActive ? 'bg-pill text-ink' : 'text-ink-3 hover:text-ink'}`
const DISARM_MS = 3000
const EDIT_MIN_WIDTH = 760

function BoardTab({ to, editing, current = false, children }) {
  if (editing) {
    return (
      <span aria-disabled="true" title="Save or cancel your edits first" className={`${TAB} ${current ? 'bg-pill text-ink' : 'text-ink-3 opacity-60'}`}>
        {children}
      </span>
    )
  }
  return (
    <NavLink to={to} end className={tabClass}>
      {children}
    </NavLink>
  )
}

function BoardTabs({ boards, currentId, editing, onNew, onEdit, canEdit }) {
  return (
    <div className="flex items-center gap-2 mb-3 min-w-0">
      <nav aria-label="Boards" className="flex items-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none]">
        <BoardTab to="/boards" editing={editing}>
          Chart
        </BoardTab>
        {boards.map((board) => (
          <BoardTab key={board.id} to={`/boards/${board.id}`} editing={editing} current={board.id === currentId}>
            {board.name}
          </BoardTab>
        ))}
        <button
          type="button"
          onClick={onNew}
          disabled={editing}
          className={`${TAB} hidden min-[760px]:inline-flex text-ink-2 hover:text-ink disabled:opacity-40`}
        >
          <Plus size={14} aria-hidden="true" /> New board
        </button>
      </nav>
      {canEdit ? (
        <div className="ml-auto shrink-0">
          <Button className="hidden min-[760px]:inline-flex" onClick={onEdit}>
            Edit board
          </Button>
          <span className="min-[760px]:hidden text-[12px] text-ink-3">Editing needs a wider screen</span>
        </div>
      ) : null}
    </div>
  )
}

function EditToolbar({ board, libraryOpen, nameRef, onRename, onToggleLibrary, onDelete, onCancel, onSave }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return undefined
    const timer = setTimeout(() => setArmed(false), DISARM_MS)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <div className="sd-panel bg-pane rounded-xl flex flex-wrap items-center gap-2 px-3.5 py-2.5 mb-3">
      <label htmlFor="board-name" className="text-[13px] text-ink-2">
        Board name
      </label>
      <Input id="board-name" ref={nameRef} value={board.name} onChange={(e) => onRename(e.target.value)} className="w-56 font-bold" />
      <Button onClick={onToggleLibrary} aria-expanded={libraryOpen} aria-pressed={libraryOpen}>
        <Plus size={14} aria-hidden="true" /> Add panel
      </Button>
      <span className="hidden min-[1100px]:inline text-[12px] text-ink-3">
        Drag the grip to move · drag the corner to resize · panels snap to 12 columns · Esc cancels a drag
      </span>
      <span className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          className="text-error"
          onClick={() => (armed ? onDelete() : setArmed(true))}
        >
          {armed ? 'Click again to delete' : 'Delete board'}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onSave}>
          Save
        </Button>
      </span>
    </div>
  )
}

function EmptyBoard({ onStart }) {
  return (
    <Card className="grid place-items-center text-center min-h-64">
      <div>
        <h2 className="text-[17px] font-bold text-ink">An empty board</h2>
        <p className="mt-1 mb-3 text-[14px] text-ink-2">
          Add panels from the library. Linked panels follow whatever you pick in a watchlist.
        </p>
        <Button variant="primary" onClick={onStart}>
          <Plus size={14} aria-hidden="true" /> Add your first panel
        </Button>
      </div>
    </Card>
  )
}

function MissingBoard() {
  return (
    <Card title="No such board">
      <p className="text-[14px] text-ink-2">
        This board is not saved in this browser.{' '}
        <Link to="/boards" className="font-semibold text-ink hover:underline">
          Back to the Chart board
        </Link>
      </p>
    </Card>
  )
}

export default function Boards() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [boards, setBoards] = useState(loadBoards)
  const [edit, setEdit] = useState(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [warnedOn, setWarnedOn] = useState(id)
  const nameRef = useRef(null)

  if (warnedOn !== id) {
    setWarnedOn(id)
    setSaveFailed(false)
  }

  const stored = boards.find((b) => b.id === id) ?? null
  const editing = Boolean(edit && edit.board.id === id)
  const board = editing ? edit.board : stored

  useEffect(() => {
    if (!edit?.focusName) return
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [edit?.focusName, editing])

  const lastId = useRef(id)
  useEffect(() => {
    const leftId = lastId.current
    lastId.current = id
    if (!edit?.unsavedId || leftId !== edit.unsavedId || id === edit.unsavedId) return
    setBoards((current) => current.filter((b) => b.id !== edit.unsavedId))
    setEdit(null)
  }, [id, edit?.unsavedId])

  const store = (next) => {
    const ok = saveBoards(next)
    setSaveFailed(!ok)
    return ok
  }

  const persist = (next) => {
    setBoards(next)
    store(next.filter((b) => b.id !== edit?.unsavedId))
  }

  const follow = (symbol) => {
    if (editing || !stored) return
    persist(boards.map((b) => (b.id === stored.id ? followSymbol(b, symbol) : b)))
  }

  const canEditHere = () => window.innerWidth >= EDIT_MIN_WIDTH

  const startEdit = (library = false) => {
    if (!stored || !canEditHere()) return
    const leftover = edit?.unsavedId
    if (leftover && leftover !== stored.id) setBoards((current) => current.filter((b) => b.id !== leftover))
    setEdit({ board: stored, library, unsavedId: null, focusName: false })
  }

  const newBoard = () => {
    if (!canEditHere()) return
    const created = createBoard(boards, stored?.sym ?? boards[0]?.sym ?? '')
    setBoards([...boards, created])
    setEdit({ board: created, library: true, unsavedId: created.id, focusName: true })
    navigate(`/boards/${created.id}`)
  }

  const change = (next) => setEdit((current) => ({ ...current, board: next, focusName: false }))

  const cancel = () => {
    setSaveFailed(false)
    if (edit.unsavedId) {
      setBoards(boards.filter((b) => b.id !== edit.unsavedId))
      setEdit(null)
      navigate('/boards')
      return
    }
    setEdit(null)
  }

  const save = () => {
    const saved = { ...edit.board, name: edit.board.name.trim() || NEW_BOARD_NAME }
    const next = boards.map((b) => (b.id === saved.id ? saved : b))
    if (!store(next)) return
    setBoards(next)
    setEdit(null)
  }

  const remove = () => {
    const next = boards.filter((b) => b.id !== edit.board.id)
    if (!store(next.filter((b) => b.id !== edit.unsavedId))) return
    setBoards(next)
    setEdit(null)
    navigate('/boards')
  }

  const tabs = (
    <BoardTabs
      boards={boards}
      currentId={id}
      editing={editing}
      onNew={newBoard}
      onEdit={() => startEdit(false)}
      canEdit={Boolean(stored) && !editing}
    />
  )

  const saveNote = saveFailed ? (
    <p role="alert" className="mb-3 text-[13px] text-warn">
      Could not save in this browser. Your changes stay on this page until you leave it.
    </p>
  ) : null

  if (!id) {
    return (
      <>
        {tabs}
        {saveNote}
        <ResearchChart />
      </>
    )
  }

  if (!board) {
    return (
      <>
        <h1 className="sr-only">Boards</h1>
        {tabs}
        {saveNote}
        <MissingBoard />
      </>
    )
  }

  return (
    <>
      <h1 className="sr-only">{board.name}</h1>
      {tabs}
      {saveNote}
      {editing ? (
        <>
          <EditToolbar
            board={board}
            libraryOpen={edit.library}
            nameRef={nameRef}
            onRename={(name) => change({ ...board, name })}
            onToggleLibrary={() => setEdit((current) => ({ ...current, library: !current.library }))}
            onDelete={remove}
            onCancel={cancel}
            onSave={save}
          />
          {edit.library ? (
            <div className="mb-3">
              <PanelLibrary onAdd={(type) => change(addPanel(board, type))} />
            </div>
          ) : null}
        </>
      ) : null}
      {board.panels.length === 0 && !editing ? (
        <EmptyBoard onStart={() => startEdit(true)} />
      ) : (
        <BoardGrid board={board} editing={editing} onChange={change} onFollow={follow} />
      )}
    </>
  )
}
