import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

import { cn } from '@/lib/cn'

export interface SelectOption {
  /** Value reported to onChange (the contract id, e.g. "en-US-female-1"). */
  value: string
  /** Full-form label shown in the trigger and the option row. */
  label: string
  /** Dimmed right-aligned annotation inside the popup (e.g. the raw code). */
  hint?: string
}

interface SelectFieldProps {
  /** Trigger id — the external <label htmlFor> points here. */
  id: string
  label: string
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/**
 * Vaporwave dropdown — a custom accessible listbox (WAI-ARIA combobox
 * pattern) instead of a bare native <select>, whose OS popup styling
 * cannot be controlled. Full keyboard support: Enter/Space/Arrow keys
 * open, arrows/Home/End navigate, Enter selects, Escape closes, Tab
 * dismisses; focus stays on the trigger via aria-activedescendant.
 */
export function SelectField({
  id,
  label,
  options,
  value,
  onChange,
  disabled,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const reactUseId = useId()
  const listboxId = `${id}-${reactUseId}`

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  // Close when the pointer goes down outside the component.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Keep the keyboard-highlighted option scrolled into view.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    rootRef.current
      ?.querySelector(`#${CSS.escape(listboxId)}-opt-${activeIndex}`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIndex, listboxId])

  const openListbox = () => {
    if (disabled || options.length === 0) return
    setOpen(true)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }

  const selectAt = (index: number) => {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return

    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        openListbox()
      }
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, options.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(options.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        selectAt(activeIndex)
        break
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      <label
        htmlFor={id}
        className="mb-2 block font-mono text-xs uppercase tracking-widest text-chrome/60"
      >
        {label}
      </label>

      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openListbox())}
        className={cn(
          'flex h-12 w-full items-center justify-between gap-3 border-2 bg-black px-3 text-left font-mono text-sm uppercase tracking-wider text-cyan transition-all duration-200 ease-linear',
          open
            ? 'border-cyan shadow-glow-cyan'
            : 'border-line hover:border-cyan/60',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className="truncate">
          {selected ? selected.label : '— NOTHING LOADED —'}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 10"
          className={cn(
            'h-2.5 w-4 shrink-0 text-cyan transition-transform duration-200 ease-linear',
            open && 'rotate-180',
          )}
        >
          <path
            d="M1 1l7 7 7-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={id}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
          }
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto border-2 border-cyan bg-panel shadow-glow-cyan backdrop-blur-md"
        >
          {options.map((option, index) => {
            const isActive = index === activeIndex
            const isSelected = index === selectedIndex
            return (
              <li
                key={option.value}
                id={`${listboxId}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectAt(index)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 font-mono text-sm transition-colors duration-200 ease-linear',
                  isActive ? 'bg-cyan/15 text-cyan' : 'text-chrome/80',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'w-3 shrink-0',
                      isSelected ? 'text-sunset' : 'text-transparent',
                    )}
                  >
                    ▸
                  </span>
                  <span className="truncate uppercase tracking-wider">
                    {option.label}
                  </span>
                </span>
                {option.hint && (
                  <span className="shrink-0 text-xs text-chrome/40">
                    {option.hint}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
