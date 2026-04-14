# PrepWise: AI-Powered Job Preparation

[![Ask DeepWiki](https://devin.ai/assets/askdeepwiki.png)](https://deepwiki.com/KARTIKPatil-44/AI-POWERED-JOB-PREP)

PrepWise is a comprehensive, AI-driven platform designed to help users land their dream jobs. It provides tools for realistic interview practice, resume optimization, and technical skill enhancement, all tailored to specific job descriptions.

## ✨ Features

-   **AI Interview Practice**: Simulate realistic job interviews with a voice-enabled AI powered by Hume AI. The AI adapts to user responses and provides detailed feedback on communication, confidence, and emotional state.
-   **Smart Resume Analysis**: Upload a resume and get an in-depth analysis of its effectiveness against a specific job description. The platform provides scores and actionable feedback on ATS compatibility, job-to-resume keyword matching, formatting, and overall impact.
-   **Technical Question Generation**: Generate an unlimited number of technical questions (easy, medium, or hard) tailored to a job role. Users can answer the questions and receive instant, AI-generated feedback and a correct solution.
-   **Personalized Job Tracks**: Users can create multiple "job info" tracks, each with a specific job title, description, and experience level, to organize their preparation for different roles.
-   **User Authentication & Subscriptions**: Secure user authentication and tiered subscription plans are managed through Clerk.

## 🚀 Tech Stack

-   **Framework**: [Next.js](https://nextjs.org/) 16 (App Router, Turbopack)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/) with [shadcn/ui](https://ui.shadcn.com/) components
-   **AI Services**:
    -   [Google Gemini](https://ai.google.dev/): For generating technical questions, providing feedback, and analyzing resumes.
    -   [Hume AI](https://hume.ai/): For empathic voice AI mock interviews.
-   **Database**: [PostgreSQL](https://www.postgresql.org/) with [Drizzle ORM](https://orm.drizzle.team/)
-   **Authentication & Billing**: [Clerk](https://clerk.com/)
-   **Security**: [Arcjet](https://arcjet.com/) for rate limiting and bot detection.
-   **State Management**: React Hook Form, AI SDK React Hooks (`useCompletion`, `useObject`)
-   **Containerization**: [Docker](https://www.docker.com/)

## 🛠️ Getting Started

To run this project locally, follow these steps:

### 1. Prerequisites

-   [Node.js](https://nodejs.org/) (v20 or later)
-   [Docker](https://www.docker.com/products/docker-desktop/) and Docker Compose
-   Access to Clerk, Google AI (Gemini), Hume AI, and Arcjet for API keys.

### 2. Clone the Repository

```bash
git clone https://github.com/kartikpatil-44/ai-powered-job-prep.git
cd ai-powered-job-prep
```

### 3. Set Up Environment Variables

Create a `.env` file in the root of the project and add the following environment variables.

```env
# Database (for Docker Compose)
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_postgres_user
DB_NAME=ai_job_prep

# Arcjet
ARCJET_KEY=your_arcjet_site_key

# Clerk
CLERK_SECRET_KEY=your_clerk_secret_key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_public_key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/onboarding

# AI Services
GEMINI_API_KEY=your_gemini_api_key
HUME_API_KEY=your_hume_api_key
HUME_SECRET_KEY=your_hume_secret_key
NEXT_PUBLIC_HUME_CONFIG_ID=your_hume_config_id
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Start the Database

Run the PostgreSQL database instance using Docker Compose.

```bash
docker-compose up -d
```

### 6. Run Database Migrations

Apply the database schema to your local PostgreSQL instance.

```bash
npm run db:migrate
```

You can also use Drizzle Studio to visualize and manage your database:

```bash
npm run db:studio
```

### 7. Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## 📂 Project Structure

The project follows a feature-driven architecture within the Next.js App Router.

```
/src
├── app/                  # Next.js App Router pages and API routes
│   ├── (landing)/        # Landing page components
│   ├── app/              # Main application dashboard and protected routes
│   └── api/              # Backend API endpoints
├── components/           # Reusable UI components (built with shadcn/ui)
├── data/                 # Environment variable configuration
├── drizzle/              # Drizzle ORM configuration, schema, and migrations
├── features/             # Business logic, actions, and components for core features (JobInfos, Interviews, etc.)
├── lib/                  # Utility functions and shared libraries
└── services/             # Third-party service integrations (AI, Clerk, Hume)
```

## 🗄️ Database Schema

The database is built with PostgreSQL and managed by Drizzle ORM. The main tables are:

-   `users`: Stores user profile information, synced from Clerk via webhooks.
-   `job_info`: Contains user-defined job descriptions, including title, experience level, and description. This forms the basis for all AI interactions.
-   `interviews`: Records mock interview sessions. Stores the duration, a reference to the Hume AI chat (`humeChatId`), and the generated feedback.
-   `questions`: Stores AI-generated technical questions, linked to a `job_info` entry, along with their difficulty.
