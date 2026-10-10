import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { catalogApi } from '../api/catalogApi'
import { apiErrorMessage } from '../api/client'
import { Button, FormField, Input, Modal, Textarea } from '../components/ui'
import { useToast } from '../components/ui/toastContext'
import { useConfirmDialog } from '../components/ui/useConfirmDialog'
import { focusFirstInvalid, useDirtyGuard } from '../forms/useDirtyGuard'
import type { CatalogItem, CatalogItemInput, ItemType } from '../types/catalog.types'
import { catalogItemSchema } from './catalogSchema'
import { CatalogIcon } from './CatalogPresentation'
import { CatalogImage } from './CatalogImage'

export function CatalogFormDialog({ item, initialType, imageOnly = false, maxImageBytes, onClose, onSaved, returnFocusRef }: {
  item?: CatalogItem; initialType: ItemType; imageOnly?: boolean; maxImageBytes?: number
  onClose: () => void; onSaved: (item: CatalogItem) => void; returnFocusRef: RefObject<HTMLButtonElement | null>
}) {
  const initial: CatalogItemInput = { name: item?.name ?? '', description: item?.description ?? '', type: item?.type ?? initialType,
    price: item?.price ?? 0, durationMinutes: item?.durationMinutes ?? undefined, requiresResource: item?.requiresResource ?? false }
  const [form, setForm] = useState(initial)
  const [persisted, setPersisted] = useState<CatalogItem | null>(imageOnly ? item ?? null : null)
  const [image, setImage] = useState<File | null>(null), [preview, setPreview] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState(''), [imageError, setImageError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false), nameInput = useRef<HTMLInputElement>(null), fileInput = useRef<HTMLInputElement>(null)
  const chooseImageButton = useRef<HTMLButtonElement>(null)
  const formElement = useRef<HTMLFormElement>(null)
  const toast = useToast(), { confirm, confirmationDialog } = useConfirmDialog()
  const id = useId(), formId = `${id}-form`
  const dirty = Boolean(image) || !persisted && JSON.stringify(form) !== JSON.stringify(initial)
  const frozen = busy || Boolean(persisted)
  useDirtyGuard(dirty || busy)
  useEffect(() => {
    if (!image) { setPreview(''); return }
    const source = URL.createObjectURL(image); setPreview(source)
    return () => URL.revokeObjectURL(source)
  }, [image])
  const close = () => {
    if (inFlight.current) return
    if (!dirty) { onClose(); return }
    confirm({ title: persisted ? 'Završi bez slanja slike?' : 'Odbaci unete podatke?',
      description: <span className="gm-catalog-confirm-description">{persisted
        ? 'Podaci stavke su sačuvani. Izabrana slika neće biti poslata ovim zatvaranjem.'
        : 'Uneti podaci i izabrana slika neće biti sačuvani.'}</span>,
      confirmLabel: persisted ? 'Završi' : 'Odbaci', variant: 'warning', onConfirm: onClose })
  }
  function chooseImage(file?: File) {
    if (!file) return
    let message = ''
    if (!['image/png', 'image/jpeg'].includes(file.type)) message = 'Izaberite sliku u PNG ili JPEG formatu.'
    else if (!file.size) message = 'Izabrani fajl je prazan.'
    else if (maxImageBytes && file.size > maxImageBytes) message = `Slika može imati najviše ${(maxImageBytes / 1048576).toLocaleString('sr-Latn-RS')} MB.`
    setErrors(current => ({ ...current, image: message }))
    if (message) { setImage(null); if (fileInput.current) fileInput.current.value = ''; return }
    setImage(file); setImageError('')
  }
  const removeChosenImage = () => {
    setImage(null); setImageError(''); setErrors(current => ({ ...current, image: '' }))
    if (fileInput.current) fileInput.current.value = ''
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    if (imageOnly && !image) { setErrors({ image: 'Izaberite sliku za slanje.' }); return }
    let request: CatalogItemInput | undefined
    if (!persisted) {
      const parsed = catalogItemSchema.safeParse(form)
      if (!parsed.success) {
        const fields: Record<string, string> = {}
        parsed.error.issues.forEach(issue => { fields[String(issue.path[0])] ??= issue.message })
        setErrors({ ...fields, image: errors.image ?? '' })
        window.requestAnimationFrame(() => { if (formElement.current) focusFirstInvalid(formElement.current) })
        return
      }
      request = parsed.data
    }
    if (errors.image) return
    inFlight.current = true; setBusy(true); setError(''); setImageError('')
    let saved = persisted
    try {
      if (!saved) {
        saved = item ? await catalogApi.update(item.id, { ...request!, version: item.version }) : await catalogApi.create(request!)
        setPersisted(saved); onSaved(saved)
      }
      if (image) {
        saved = await catalogApi.uploadImage(saved, image)
        setPersisted(saved); onSaved(saved)
      }
      toast(imageOnly ? 'Slika je sačuvana.' : item ? 'Izmene su sačuvane.' : 'Stavka je kreirana.', 'success')
      onClose()
    } catch (cause) {
      if (saved) setImageError(apiErrorMessage(cause, 'Slanje slike nije potvrđeno.'))
      else setError(apiErrorMessage(cause, 'Stavku nije moguće sačuvati.'))
    } finally { inFlight.current = false; setBusy(false) }
  }
  async function refreshVersion() {
    if (!persisted || inFlight.current) return
    inFlight.current = true; setBusy(true)
    try {
      const current = await catalogApi.get(persisted.id)
      setPersisted(current); onSaved(current)
      setImageError('Verzija je osvežena. Proverite trenutnu sliku pre ponovnog slanja izabranog fajla.')
    } catch (cause) { setImageError(apiErrorMessage(cause, 'Verziju stavke nije moguće osvežiti.')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <>
    <Modal open className="gm-catalog-form-dialog" title={imageOnly ? 'Promeni sliku' : item ? 'Izmeni stavku' : 'Nova stavka'}
      titleIcon={<CatalogIcon type={form.type} />} onClose={close} closeDisabled={busy}
      initialFocusRef={imageOnly ? chooseImageButton : nameInput} returnFocusRef={returnFocusRef}
      footer={<div className="gm-catalog-dialog-actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={close}>{persisted && !imageOnly ? 'Završi' : item ? 'Odustani' : 'Otkaži'}</Button>
        {(!persisted || image || imageOnly) && <Button type="submit" form={formId} className="gm-catalog-pink-button" loading={busy}
          disabled={Boolean(errors.image) || imageOnly && !image}>
          {imageOnly || persisted && image ? imageError ? 'Ponovo pošalji sliku' : 'Sačuvaj sliku' : item ? 'Sačuvaj izmene' : 'Kreiraj stavku'}</Button>}
      </div>}>
      <form ref={formElement} id={formId} className="gm-catalog-form" onSubmit={submit} noValidate>
        <p className="gm-catalog-form-intro">{imageOnly ? `Slika za stavku „${item?.name ?? ''}“.` : item ? 'Ažurirajte podatke i sliku stavke.' : 'Dodajte novu uslugu ili proizvod u katalog.'}</p>
        {error && <p className="error-banner gm-catalog-wide" role="alert">{error}</p>}
        {!imageOnly && <>
          <fieldset className="gm-catalog-type-control gm-catalog-wide" disabled={frozen}><legend>Tip stavke</legend>
            <div role="group" aria-label="Tip stavke">{(['SERVICE', 'PRODUCT'] as const).map(type =>
              <Button key={type} type="button" variant="secondary" aria-pressed={form.type === type} disabled={frozen}
                onClick={() => { setForm(current => ({ ...current, type, durationMinutes: type === 'PRODUCT' ? undefined : current.durationMinutes,
                  requiresResource: type === 'SERVICE' && Boolean(current.requiresResource) })); setErrors(current => ({ image: current.image ?? '' })) }}>
                <CatalogIcon type={type} />{type === 'SERVICE' ? 'Usluga' : 'Proizvod'}</Button>)}</div>
          </fieldset>
          <FormField label="Naziv *" htmlFor={`${id}-name`} error={errors.name}>
            <Input ref={nameInput} id={`${id}-name`} required maxLength={150} disabled={frozen} value={form.name}
              onChange={event => setForm({ ...form, name: event.target.value })} /></FormField>
          <FormField label="Cena (RSD) *" htmlFor={`${id}-price`} error={errors.price}>
            <Input id={`${id}-price`} type="number" min="0.01" max="9999999999.99" step="0.01" required disabled={frozen}
              value={form.price || ''} onChange={event => setForm({ ...form, price: Number(event.target.value) })} /></FormField>
          {form.type === 'SERVICE' && <>
            <FormField label="Trajanje usluge (min) *" htmlFor={`${id}-duration`} error={errors.durationMinutes}>
              <Input id={`${id}-duration`} type="number" min="1" step="1" required disabled={frozen} value={form.durationMinutes ?? ''}
                onChange={event => setForm({ ...form, durationMinutes: Number(event.target.value) || undefined })} /></FormField>
            <label className="gm-catalog-resource-checkbox"><input type="checkbox" disabled={frozen} checked={form.requiresResource ?? false}
              onChange={event => setForm({ ...form, requiresResource: event.target.checked })} />Usluga zahteva fizički resurs</label>
          </>}
          <div className="gm-catalog-wide"><FormField label="Opis" htmlFor={`${id}-description`} error={errors.description}>
            <Textarea id={`${id}-description`} rows={3} maxLength={2000} disabled={frozen} value={form.description ?? ''}
              onChange={event => setForm({ ...form, description: event.target.value })} /></FormField></div>
        </>}
        <section className="gm-catalog-upload gm-catalog-wide" aria-label="Slika stavke"><h3>Slika stavke</h3>
          {preview ? <div className="gm-catalog-image"><img src={preview} alt="Pregled izabrane slike" /></div> :
            (persisted ?? item) ? <CatalogImage key={(persisted ?? item)!.imageUrl} item={(persisted ?? item)!} eager /> :
              <div className="gm-catalog-upload-placeholder"><CatalogIcon type={form.type} /><span>Dodajte sliku stavke</span></div>}
          <Input ref={fileInput} id={`${id}-image`} type="file" accept="image/png,image/jpeg" disabled={busy} hidden
            onChange={event => chooseImage(event.target.files?.[0])} />
          <FormField label="Format slike" htmlFor={`${id}-choose-image`} error={errors.image}
            hint={`PNG ili JPEG${maxImageBytes ? ` · najviše ${(maxImageBytes / 1048576).toLocaleString('sr-Latn-RS')} MB` : ' · veličinu proverava server'}.`}>
            <Button ref={chooseImageButton} id={`${id}-choose-image`} type="button" variant="secondary" disabled={busy}
              onClick={() => fileInput.current?.click()}><span aria-hidden="true">↑</span> Izaberi sliku</Button></FormField>
          {(image || errors.image) && <div className="gm-catalog-upload-file"><span>{image?.name ?? 'Slika nije izabrana.'}</span>
            <Button type="button" variant="secondary" disabled={busy} onClick={removeChosenImage}>{image ? 'Ukloni izabranu sliku' : 'Očisti izbor slike'}</Button></div>}
          <small>Slika postaje dostupna nakon bezbednosne provere fajla.</small>
          {imageError && <div className="gm-catalog-upload-error" role="alert">
            <strong>{imageOnly ? 'Slanje slike nije potvrđeno.' : 'Podaci stavke su sačuvani; slanje slike nije potvrđeno.'}</strong>
            <p>{imageError}</p><Button type="button" variant="secondary" disabled={busy} onClick={() => void refreshVersion()}>Osveži verziju i trenutnu sliku</Button>
            {persisted && <div className="gm-catalog-current-image"><span>Trenutna slika sa servera</span><CatalogImage key={persisted.imageUrl} item={persisted} eager /></div>}
          </div>}
        </section>
      </form>
    </Modal>
    {confirmationDialog}
  </>
}
