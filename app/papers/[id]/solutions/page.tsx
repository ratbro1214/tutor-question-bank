import { PaperSolutionReview } from '@/components/paper-solution-review';
export default async function Page({params}:{params:Promise<{id:string}>}){return <PaperSolutionReview paperId={(await params).id}/>;}
