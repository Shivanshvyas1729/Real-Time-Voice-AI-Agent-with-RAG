import axios, { AxiosInstance } from "axios";

const baseURL = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
if (!baseURL) {
  console.warn("VITE_API_BASE_URL is not set. Please add it to your .env.");
}

const api: AxiosInstance = axios.create({
  baseURL: baseURL,
  headers: { "Content-Type": "application/json" },
});

export interface Tenant {
  _id?: string;
  tenant_id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Equipment {
  _id?: string;
  name: string;
  description: string;
  tenant_id: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UploadDocumentResponse {
  count?: number;
  message?: string;
  documents?: Array<{
    _id: string;
    file_name: string;
    content_type: string;
    size: number;
    embedding_status: string;
    description?: string;
    created_at?: string;
  }>;
}

export const getTenants = async (): Promise<Tenant[]> => {
  const response = await api.get("/tenants/");
  return response.data;
};

export const createTenant = async (tenant: {
  tenant_id: string;
  name: string;
  description?: string;
}): Promise<Tenant> => {
  const response = await api.post("/tenants/", tenant);
  return response.data;
};

export const getEquipmentList = async (): Promise<Equipment[]> => {
  const response = await api.get("/equipment/");
  return response.data;
};

export const createEquipment = async (equipment: {
  name: string;
  description: string;
  tenant_id: string;
  is_active?: boolean;
}): Promise<Equipment> => {
  const response = await api.post("/equipment/", equipment);
  return response.data;
};

export const uploadEquipmentDocuments = async (
  equipmentId: string,
  files: File[],
  descriptions?: string[] | string
): Promise<UploadDocumentResponse> => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  if (descriptions) {
    if (typeof descriptions === "string") {
      formData.append("descriptions", descriptions);
    } else {
      descriptions.forEach((desc) => {
        formData.append("descriptions", desc);
      });
    }
  }

  const response = await api.post(`/equipment/${equipmentId}/documents`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const getEquipmentDocuments = async (equipmentId: string) => {
  const response = await api.get(`/equipment/${equipmentId}/documents`);
  return response.data;
};

export default api;
