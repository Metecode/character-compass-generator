/** Izgara kenar uzunluğu. Hücre sayısı her zaman gridSize². */
export type GridSize = 2 | 3 | 4

/** Bir bölgenin (2x2/4x4'te çeyrek, 3x3'te satır bandı) rengi ve etiketi. */
export interface Region {
  color: string
  label?: string
}

/** Geriye dönük ad. */
export type Quadrant = Region

/** Sırası: sol üst, sağ üst, sol alt, sağ alt. */
export type Quadrants = [Region, Region, Region, Region]
/** Sırası: üst, orta, alt satır. */
export type Bands = [Region, Region, Region]

export interface Cell {
  id: string
  name: string
  bullets: string[]
  photoId?: string
}

export interface Compass {
  id: string
  title: string
  gridSize: GridSize
  /** 2x2 ve 4x4 için. */
  quadrants: Quadrants
  /** 3x3 için. Boyut değişince diğer liste korunur. */
  bands: Bands
  /** Madde havuzunun geleceği tema. */
  themeId: string
  /** İsimler büyük harfle mi gösterilsin. */
  uppercaseNames: boolean
  /** Satır satır (row-major), uzunluğu gridSize². */
  cells: Cell[]
}

/** Hücrede değiştirilebilen içerik (id hariç). */
export type CellContent = Omit<Cell, 'id'>
