import axios, { AxiosInstance } from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL as string | undefined
if (!baseURL) {
  console.warn('VITE_API_BASE_URL is not set. Please add it to your .env.')
}

const api: AxiosInstance = axios.create({
  baseURL: baseURL,
  headers: { 'Content-Type': 'application/json' },
})

export interface Tenant {
  _id?: string
  tenant_id: string
  name: string
  description?: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface Equipment {
  _id?: string
  name: string
  description: string
  tenant_id: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface UploadDocumentResponse {
  documents: Array<{
    _id: string
    file_name: string
    content_type: string
    size: number
    embedding_status: string
    description?: string
  }>
  count: number
}

// Tenant API
export const getTenants = async (): Promise<Tenant[]> => {
  const response = await api.get('/tenants/')
  return Array.isArray(response.data) ? response.data : []
}

export const createTenant = async (tenant: {
  tenant_id: string
  name: string
  description?: string
}): Promise<Tenant> => {
  const response = await api.post('/tenants/', tenant)
  return response.data
}

// Equipment API
export const getEquipmentList = async (): Promise<Equipment[]> => {
  const response = await api.get('/equipment/')
  return Array.isArray(response.data) ? response.data : []
}

export const createEquipment = async (equipment: {
  name: string
  description: string
  tenant_id: string
  is_active?: boolean
}): Promise<Equipment> => {
  const response = await api.post('/equipment/', equipment)
  return response.data
}

// Documents API
export const uploadEquipmentDocuments = async (
  equipmentId: string,
  files: File[],
  description?: string
): Promise<UploadDocumentResponse> => {
  const formData = new FormData()
  files.forEach((file) => {
    formData.append('files', file)
  })
  if (description) {
    formData.append('description', description)
  }

  const response = await api.post(`/equipment/${equipmentId}/documents`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

export const getEquipmentDocuments = async (equipmentId: string) => {
  const response = await api.get(`/equipment/${equipmentId}/documents`)
  return response.data
}

export default api