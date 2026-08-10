import { render,screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { beforeEach,describe,expect,it,vi } from 'vitest'
import { documentApi } from '../api/documentApi'
import { useAuthStore } from '../auth/authStore'
import { authUser } from '../test/fixtures'
import { DocumentsPage } from './DocumentsPage'

vi.mock('../api/documentApi',()=>({documentApi:{list:vi.fn(),upload:vi.fn(),version:vi.fn(),remove:vi.fn(),restore:vi.fn(),content:vi.fn()}}))

describe('DocumentsPage',()=>{
  beforeEach(()=>{useAuthStore.getState().setSession('token',authUser('CUSTOMER'));vi.mocked(documentApi.list).mockResolvedValue([])})
  it('offers accessible upload and empty state',async()=>{const {container}=render(<DocumentsPage/>);expect(await screen.findByText('Nema dokumenata')).toBeVisible();expect(screen.getByLabelText(/Izaberite dokument/)).toHaveAttribute('accept','.png,.jpg,.jpeg,.pdf,.txt');expect((await axe(container)).violations.filter(({impact})=>impact==='serious'||impact==='critical')).toHaveLength(0)})
  it('reports failure and supports retry',async()=>{vi.mocked(documentApi.upload).mockImplementation(async(_t,_id,_f,progress)=>{progress(50);throw new Error('offline')});render(<DocumentsPage/>);const file=new File(['hello'],'note.txt',{type:'text/plain'});await userEvent.upload(await screen.findByLabelText(/Izaberite dokument/),file);expect(await screen.findByRole('button',{name:'Pokušaj ponovo'})).toBeVisible()})
})
