/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

import { CR_ICON_SIZE, CR_ICON_Z_INDEX, type VALIDATION_STATUS, CR_ICON_MARGIN_RIGHT, CR_ICON_MARGIN_TOP, CR_ICON_AUDIO_MARGIN_TOP, CR_ICON_AUDIO_MARGIN_RIGHT } from './constants'
import { type MediaElement } from './mediaRecord'

const SVG_CR_SUCCESS = `<svg xmlns="http://www.w3.org/2000/svg" fill="CURRENT_COLOR" viewBox="0 0 41 41"><path stroke="%23000" stroke-width="3.12" d="M1.56 18c0-9.08 7.361-16.44 16.441-16.44s16.443 7.362 16.443 16.442V34.44H18C8.92 34.44 1.56 27.08 1.56 18Z" /><path fill="%23000" d="M13.665 26.483c-4.07 0-6.61-3.189-6.61-6.973 0-3.785 2.54-6.973 6.61-6.973 3.292 0 5.522 2.152 6.118 4.951h-3.318c-.441-1.244-1.478-1.996-2.8-1.996-2.048 0-3.396 1.607-3.396 4.018s1.348 4.018 3.396 4.018c1.374 0 2.437-.804 2.852-2.126h3.292c-.545 2.878-2.8 5.08-6.144 5.08M21.12 26.12V12.9h3.11v1.426c.726-.96 1.866-1.582 3.577-1.582h.804v3.06h-.83c-1.166 0-1.892.258-2.436.75-.622.52-.985 1.375-.985 2.67v6.896z" /></svg>`
const SVG_CR_WARNING = `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="157" height="141" overflow="hidden"><path stroke="%23000" stroke-width="10.73" d="M5.37 61.9c0-31.22 25.31-56.53 56.54-56.53s56.54 25.31 56.54 56.54v56.53H61.9c-31.22 0-56.53-25.31-56.53-56.54Z" /><path d="M46.99 91.08C33 91.08 24.26 80.11 24.26 67.1c0-13.02 8.74-23.98 22.73-23.98 11.33 0 18.99 7.39 21.04 17.02H56.62c-1.51-4.28-5.08-6.86-9.63-6.86-7.04 0-11.67 5.52-11.67 13.82 0 8.29 4.63 13.81 11.67 13.81 4.73 0 8.38-2.76 9.81-7.31h11.32c-1.87 9.9-9.63 17.48-21.13 17.48M72.63 89.83V44.36h10.7v4.91c2.49-3.3 6.42-5.44 12.3-5.44h2.76v10.52h-2.85c-4.01 0-6.51.89-8.38 2.58-2.14 1.79-3.39 4.73-3.39 9.18v23.72z" /><path fill="CURRENT_COLOR" d="m152.444 124.167-32.99-54.542c-1.266-2.166-4.557-2.166-5.823 0l-33.075 54.542c-1.265 2.165.338 4.812 2.953 4.812h65.981c2.616 0 4.22-2.647 2.954-4.812m-38.475-41.709h5.062v28.073h-5.062zm2.531 39.302c-2.362 0-4.219-1.764-4.219-4.01s1.857-4.01 4.22-4.01 4.218 1.764 4.218 4.01-1.856 4.01-4.219 4.01" /></svg>`
const SVG_CR_ERROR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 41"><path stroke="%23000" stroke-width="3.12" d="M1.56 18c0-9.08 7.361-16.44 16.441-16.44s16.443 7.362 16.443 16.442V34.44H18C8.92 34.44 1.56 27.08 1.56 18Z" /><path d="M13.665 26.483c-4.07 0-6.61-3.189-6.61-6.973 0-3.785 2.54-6.973 6.61-6.973 3.292 0 5.522 2.152 6.118 4.951h-3.318c-.441-1.244-1.478-1.996-2.8-1.996-2.048 0-3.396 1.607-3.396 4.018s1.348 4.018 3.396 4.018c1.374 0 2.437-.804 2.852-2.126h3.292c-.545 2.878-2.8 5.08-6.144 5.08M21.12 26.12V12.9h3.11v1.426c.726-.96 1.866-1.582 3.577-1.582h.804v3.06h-.83c-1.166 0-1.892.258-2.436.75-.622.52-.985 1.375-.985 2.67v6.896z" /><rect width="16" height="16" x="25" y="25" rx="1.5" ry="1.5" style="fill:CURRENT_COLOR" /><path d="m28 28 10.4 10.4M28 38.4 38.4 28" style="stroke:%23fff;stroke-width:2;stroke-linecap:round" /></svg>`

const SVG_CR_AI_SUCCESS = `<svg xmlns="http://www.w3.org/2000/svg" fill="CURRENT_COLOR" viewBox="0 0 41 41"><path stroke="%23000" stroke-width="3.12" d="M1.56 18c0-9.08 7.361-16.44 16.441-16.44s16.443 7.362 16.443 16.442V34.44H18C8.92 34.44 1.56 27.08 1.56 18Z" /><path fill="%23000" d="M13.665 26.483c-4.07 0-6.61-3.189-6.61-6.973 0-3.785 2.54-6.973 6.61-6.973 3.292 0 5.522 2.152 6.118 4.951h-3.318c-.441-1.244-1.478-1.996-2.8-1.996-2.048 0-3.396 1.607-3.396 4.018s1.348 4.018 3.396 4.018c1.374 0 2.437-.804 2.852-2.126h3.292c-.545 2.878-2.8 5.08-6.144 5.08M21.12 26.12V12.9h3.11v1.426c.726-.96 1.866-1.582 3.577-1.582h.804v3.06h-.83c-1.166 0-1.892.258-2.436.75-.622.52-.985 1.375-.985 2.67v6.896z" /><path fill="%23000" d="M25.5 25.5h10v10h-10z" /></svg>`
const SVG_CR_AI_ERROR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 41"><path stroke="%23000" stroke-width="3.12" d="M1.56 18c0-9.08 7.361-16.44 16.441-16.44s16.443 7.362 16.443 16.442V34.44H18C8.92 34.44 1.56 27.08 1.56 18Z" /><path d="M13.665 26.483c-4.07 0-6.61-3.189-6.61-6.973 0-3.785 2.54-6.973 6.61-6.973 3.292 0 5.522 2.152 6.118 4.951h-3.318c-.441-1.244-1.478-1.996-2.8-1.996-2.048 0-3.396 1.607-3.396 4.018s1.348 4.018 3.396 4.018c1.374 0 2.437-.804 2.852-2.126h3.292c-.545 2.878-2.8 5.08-6.144 5.08M21.12 26.12V12.9h3.11v1.426c.726-.96 1.866-1.582 3.577-1.582h.804v3.06h-.83c-1.166 0-1.892.258-2.436.75-.622.52-.985 1.375-.985 2.67v6.896z" /><rect width="16" height="16" x="25" y="25" rx="1.5" ry="1.5" style="fill:CURRENT_COLOR" /><path d="m28 28 10.4 10.4M28 38.4 38.4 28" style="stroke:%23fff;stroke-width:2;stroke-linecap:round" /></svg>`

const imageSources: { [key in VALIDATION_STATUS]: string } = {
  success: SVG_CR_SUCCESS,
  warning: SVG_CR_WARNING,
  error: SVG_CR_ERROR,
  img: chrome.runtime.getURL('icons/camera.svg'),
  video: chrome.runtime.getURL('icons/video.svg'),
  audio: chrome.runtime.getURL('icons/audio.svg'),
  none: '',
  'ai-success': SVG_CR_AI_SUCCESS,
  'ai-error': SVG_CR_AI_ERROR
}

export class CrIcon {
  private _crDiv!: HTMLDivElement | null
  private readonly _parent: MediaElement
  private _status: VALIDATION_STATUS
  private _clickListener: ((this: HTMLDivElement, ev: MouseEvent) => unknown) | undefined

  constructor (parent: MediaElement, status: VALIDATION_STATUS) {
    this._parent = parent
    this._status = status
    
    const iconDiv = document.createElement('div')
    iconDiv.className = 'c2pa-icon-container'
    iconDiv.style.position = 'absolute'
    iconDiv.style.width = CR_ICON_SIZE
    iconDiv.style.height = CR_ICON_SIZE
    iconDiv.style.zIndex = CR_ICON_Z_INDEX.toString()
    iconDiv.style.cursor = 'pointer'
    iconDiv.setAttribute('c2pa-icon', 'c2pa-icon')
    
    this._crDiv = iconDiv
    document.body.appendChild(this._crDiv)
    this.setStatus(status) // Set initial SVG and color
    this.show()
  }

  public setMetadataLink (url: string): void {
    if (this._crDiv == null) {
      throw new Error('Icon not created')
    }
    this._crDiv.title = `Click to view C2PA metadata: ${url}`
  }

  public remove (): void {
    if (this._crDiv == null) return
    if (this._clickListener != null) this._crDiv.removeEventListener('click', this._clickListener as EventListener)
    console.debug('Removing CrIcon:', this._crDiv.title)
    this._crDiv.remove()
    this._crDiv = null
  }

  public get img (): HTMLDivElement { // Changed return type to HTMLDivElement
    if (this._crDiv == null) {
      throw new Error('Icon not created')
    }
    return this._crDiv
  }

  public hide (): void {
    if (this._crDiv == null) {
      throw new Error('Icon not created')
    }
    this._crDiv.style.display = 'none'
  }

  public show (): void {
    if (this._crDiv == null) {
      throw new Error('Icon not created')
    }
    this._crDiv.style.display = ''
    this.position()
  }

  public position (topOffset = this._status === 'audio' ? CR_ICON_AUDIO_MARGIN_TOP : CR_ICON_MARGIN_TOP, rightOffset = this._status === 'audio' ? CR_ICON_AUDIO_MARGIN_RIGHT : CR_ICON_MARGIN_RIGHT): void {
    if (this._crDiv == null) {
      throw new Error('Icon not created')
    }
    const rect = this._parent.getBoundingClientRect()
    this._crDiv.style.top = `${rect.top + window.scrollY + topOffset}px`
    this._crDiv.style.left = `${rect.right + window.scrollX - this._crDiv.offsetWidth - rightOffset}px` // Use offsetWidth
  }

  // eslint-disable-next-line accessor-pairs
  set onClick (listener: (this: HTMLDivElement, ev: MouseEvent) => unknown | null) { // Changed this type
    if (this._crDiv == null) {
      throw new Error('Icon not created')
    }
    this._clickListener = listener
    this._crDiv.addEventListener('click', listener as EventListener) // Cast to EventListener
  }

  get status (): VALIDATION_STATUS {
    return this._status
  }

  set status (status: VALIDATION_STATUS) {
    if (this._crDiv == null) {
      throw new Error('Icon not created')
    }
    if (!CrIcon.validateStatus(status)) {
      throw new Error('Invalid status')
    }
    this._status = status
    this.setStatus(status) // Call new helper to update SVG
  }

  private setStatus (status: VALIDATION_STATUS): void {
    let fillColor = 'green'
    if (status === 'warning') {
      fillColor = '#FFC000' // Yellow/Orange for warning
    } else if (status === 'error') {
      fillColor = '#ae3f28' // Red for error
    }

    const svgContent = imageSources[status].replace(/CURRENT_COLOR/g, fillColor)
    this._crDiv!.style.backgroundImage = `url('data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}')`
    this._crDiv!.style.backgroundSize = 'contain'
    this._crDiv!.style.backgroundRepeat = 'no-repeat'
  }

  private static validateStatus (status: unknown): status is VALIDATION_STATUS {
    return ['success', 'warning', 'error', 'img', 'video', 'audio', 'none'].includes(status as string)
  }
}
