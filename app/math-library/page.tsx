import { AppShell } from '@/components/app-shell';
import { QuestionBankHub } from '@/components/question-bank-hub';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
export default async function Page(){await requireChatGPTUser('/math-library');return <AppShell><QuestionBankHub/></AppShell>;}
