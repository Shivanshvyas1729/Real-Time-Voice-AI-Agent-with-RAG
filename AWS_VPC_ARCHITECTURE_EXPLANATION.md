# ??? AWS VPC Cloud Architecture & Flow Breakdown

This document provides a component-by-component technical explanation and visual traffic flow diagram for the AWS production deployment architecture of the **Real-Time Voice AI Agent & RAG System**.

---

## ?? System Architecture Diagram

```mermaid
graph LR
    subgraph VPC["VPC (Virtual Private Cloud - 10.0.0.0/16)"]
        IGW["Internet Gateway"]
        
        subgraph PublicSubnet["Public Subnet"]
            ALB["ALB (Application Load Balancer)"]
            NAT["NAT Gateway"]
        end
        
        subgraph PrivateSubnet["Private Subnet"]
            ECS_BE["ECS Backend (Container Task - Port 8000)"]
            ECS_FE["ECS Frontend (Container Task - Port 80)"]
        end
    end

    Users(("Users (Internet)")) -->|1. Inbound HTTP/HTTPS/WebSocket| IGW
    IGW -->|2. Forward Ingress| ALB
    ALB -->|3a. Route /api/v1/*| ECS_BE
    ALB -->|3b. Route /*| ECS_FE
    
    ECS_BE -->|4a. Outbound API Calls (Deepgram, Groq, MongoDB)| NAT
    ECS_FE -->|4b. Outbound Requests| NAT
    NAT -->|5. Forward Egress| IGW
    IGW -->|6. External AI Services & Databases| External(("External Internet & Cloud Services"))
```

---

## ?? Component-by-Component Explanation

### 1. ?? Users (Internet)
* **Role**: Public clients (web browsers, mobile devices, external webhooks) accessing the Voice AI platform.
* **Function**: Initiates HTTP requests for frontend pages, REST API calls for RAG/document operations, and persistent bi-directional WebSockets for real-time voice streaming.

### 2. ?? Internet Gateway (IGW)
* **Role**: The edge entry/exit gateway for the AWS Virtual Private Cloud (VPC).
* **Function**:
  * Provides a target in VPC route tables for internet-routable traffic.
  * Performs Network Address Translation (NAT) for public IP addresses.
  * Allows public clients on the internet to reach public-facing AWS resources (ALB) and allows internal resources (via NAT Gateway) to access external web services.

### 3. ??? VPC (Virtual Private Cloud)
* **Role**: The logically isolated virtual network boundary in the AWS Cloud (`10.0.0.0/16`).
* **Function**: Enforces strict network isolation, IP address range allocation, routing tables, and security group firewalls for all application components.

### 4. ?? Public Subnet
* **Role**: A VPC subnet configured with a route table entry pointing directly to the Internet Gateway.
* **Function**: Hosts public-facing components that require direct internet exposure or public IP allocation.
* **Key Components**:
  * **ALB (Application Load Balancer)**:
    * Acts as the single entry point for all incoming web and WebSocket connections.
    * Performs SSL/TLS termination.
    * Evaluates Layer 7 path rules: routes `/api/v1/*` requests to the Backend target group and all remaining paths `/*` to the Frontend target group.
    * Health-checks private ECS tasks to guarantee zero-downtime routing.
  * **NAT Gateway (Network Address Translation)**:
    * Managed network device allocated with a Elastic IP (EIP) inside the public subnet.
    * Allows private instances to initiate outbound connections while blocking unrequested inbound connections from the internet.

### 5. ?? Private Subnet
* **Role**: An isolated VPC subnet with no route to the Internet Gateway and no public IP addresses assigned.
* **Function**: Houses core compute workloads, keeping containerized application servers hidden and secured from direct internet access.
* **Key Components**:
  * **ECS Backend (Fargate Task Container)**:
    * Runs the Python FastAPI Real-Time Voice Agent application on port 8000.
    * Executes vector search algorithms, RAG pipeline orchestration, STT/TTS handling, and database interactions.
    * Accessible **only** via the ALB; outbound requests pass through the NAT Gateway.
  * **ECS Frontend (Fargate Task Container)**:
    * Runs the Nginx/Web frontend application container on port 80.
    * Serves static UI assets and manages frontend state.
    * Accessible **only** via the ALB; outbound requests pass through the NAT Gateway.

---

## ?? End-to-End Traffic Flow

### ?? Inbound Traffic Flow (Request Ingress)
1. **User Request**: A client sends an HTTP request or opens a WebSocket connection to the domain name.
2. **Internet Gateway**: The packet arrives at AWS and passes through the VPC **Internet Gateway**.
3. **Application Load Balancer**: Traffic reaches the **ALB** located in the **Public Subnet**.
4. **Target Routing**: The **ALB** evaluates URL path rules and forwards traffic across the subnet boundary into the **Private Subnet**:
   * API/Voice WebSocket requests $\rightarrow$ **ECS Backend** (Port 8000).
   * Web page requests $\rightarrow$ **ECS Frontend** (Port 80).

### ?? Outbound Traffic Flow (Request Egress)
1. **Outbound Trigger**: **ECS Backend** needs to connect to external cloud services (e.g. MongoDB Atlas Vector Search, Deepgram STT, Groq LLM, ElevenLabs TTS).
2. **Private Route Table**: Private Subnet route table directs all `0.0.0.0/0` outbound traffic to the **NAT Gateway**.
3. **NAT Processing**: The **NAT Gateway** in the **Public Subnet** translates the source private IP to its public Elastic IP (EIP).
4. **Internet Gateway Egress**: Packet is forwarded through the **Internet Gateway** out to the public internet.
5. **Response Handling**: Returning packets flow back through the **NAT Gateway**, which translates the destination IP back to the private IP of the initiating ECS container task.

---

## ?? Summary Matrix

| Component | Subnet Type | Public IP? | Primary Purpose |
| :--- | :--- | :--- | :--- |
| **Internet Gateway** | VPC Edge | Yes | Gateway for VPC inbound & outbound traffic |
| **ALB (Load Balancer)** | Public Subnet | Yes | Public entry point, SSL termination, L7 routing |
| **NAT Gateway** | Public Subnet | Yes (EIP) | Outbound internet access for private workloads |
| **ECS Backend** | Private Subnet | No | Voice AI & RAG pipeline logic execution (Port 8000) |
| **ECS Frontend** | Private Subnet | No | Web UI static asset & frontend delivery (Port 80) |

