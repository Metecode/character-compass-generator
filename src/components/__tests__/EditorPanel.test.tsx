import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultCompass } from '../../lib/grid'
import { useCompassStore } from '../../store/compassStore'
import { EditorPanel } from '../EditorPanel'

beforeEach(() => {
  // Mobil: lg kırılımı eşleşmez.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const compass = createDefaultCompass(3)
  useCompassStore.setState({ compass, selectedId: compass.cells[0]!.id })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const cells = () => useCompassStore.getState().compass.cells
const enter = (el: Element) => fireEvent.keyDown(el, { key: 'Enter' })

describe('EditorPanel (mobil)', () => {
  it('başlık kişinin adı, isim boşsa "Yeni kişi"', () => {
    render(<EditorPanel />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Yeni kişi')
    fireEvent.change(screen.getByLabelText('İsim'), { target: { value: 'Deniz' } })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Deniz')
    expect(screen.getByText('Hücre 1 / 9')).toBeInTheDocument()
  })

  it('madde satırında yukarı/aşağı butonu yok; tutamaç, zar ve sil var', () => {
    useCompassStore.getState().updateCell(cells()[0]!.id, { bullets: ['A', 'B'] })
    render(<EditorPanel />)
    expect(screen.queryByRole('button', { name: /yukarı taşı|aşağı taşı/ })).toBeNull()
    expect(screen.getByRole('button', { name: '1. maddeyi taşı' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1. madde için zar at' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1. maddeyi sil' })).toBeInTheDocument()
  })

  it('Enter: isimden maddeye, son maddede yeni madde, 3. maddeden sonra sonraki hücre', () => {
    render(<EditorPanel />)
    const name = screen.getByLabelText('İsim')
    fireEvent.change(name, { target: { value: 'Deniz' } })
    enter(name)
    expect(cells()[0]!.bullets).toEqual([''])
    expect(screen.getByLabelText('Madde 1')).toHaveFocus()

    for (const [i, text] of ['Kaos ajanı', 'Gece kuşu', 'Plan bozan'].entries()) {
      const input = screen.getByLabelText(`Madde ${i + 1}`)
      fireEvent.change(input, { target: { value: text } })
      act(() => {
        enter(input)
      })
    }
    expect(cells()[0]!.bullets).toEqual(['Kaos ajanı', 'Gece kuşu', 'Plan bozan'])
    // 3. maddede Enter: sonraki hücre seçildi ve isim alanı odakta.
    expect(useCompassStore.getState().selectedId).toBe(cells()[1]!.id)
    expect(screen.getByText('Hücre 2 / 9')).toBeInTheDocument()
    expect(screen.getByLabelText('İsim')).toHaveFocus()
  })

  it('Önceki / Sonraki butonları hücreler arasında gezer, uçlarda pasif', () => {
    render(<EditorPanel />)
    expect(screen.getByRole('button', { name: 'Önceki' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }))
    expect(useCompassStore.getState().selectedId).toBe(cells()[1]!.id)
    fireEvent.click(screen.getByRole('button', { name: 'Önceki' }))
    expect(useCompassStore.getState().selectedId).toBe(cells()[0]!.id)

    act(() => useCompassStore.getState().select(cells()[8]!.id))
    expect(screen.getByRole('button', { name: 'Sonraki' })).toBeDisabled()
  })
})
