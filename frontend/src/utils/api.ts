import axios, { AxiosInstance } from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL as string | undefined
if (!baseURL) {
  console.warn('VITE_API_BASE_URL is not set. Please add it to your .env.')
}

const api: AxiosInstance = axios.create({
  baseURL: baseURL,
  headers: { 'Content-Type': 'application/json' },
})

export default api

