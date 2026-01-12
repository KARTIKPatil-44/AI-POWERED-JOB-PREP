"use server"

import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { cacheTag } from "next/cache"
import { getJobInfoIdTag } from "../jobInfos/dbCache"
import { db } from "@/drizzle/db"
import { and, eq } from "drizzle-orm"
import { InterviewTable, JobInfoTable } from "@/drizzle/schema"
import { insertInterview, updateInterview as updateInterviewDb  } from "./db"
import { getInterviewIdTag } from "./dbCache"
import { canCreateInterview } from "./permissions"
import { PLAN_LIMIT_MESSAGE } from "@/lib/errorToast"


export async function createInterview({
    jobInfoId,
}: {
    jobInfoId: string
}) : Promise<{ error:true; message: string} | {error:false; id:string}
>{
    const { userId } = await getCurrentUser()
    if (userId == null) {
        return {
            error: true,
            message: "You don't have permisssion to do this "
        }
    }
    // Permissions
    if(!(await canCreateInterview())){
        return{
            error:true,
            message: PLAN_LIMIT_MESSAGE,
        }
    }
    // Rate Limit
    // Job info

    const jobInfo = await getJobInfo(jobInfoId, userId)
    if (jobInfo == null) {
        return {
            error: true,
            message: "You don't have permisssion to do this",
        }
    }


    // create interview in the database
    const interview = await insertInterview({jobInfoId, duration:"00:00:00"})
    return{error:false, id:interview.id}

}
export async function updateInterview(
    id:string,
    data:{
        humeChatId?:string
        duration:string
    }
) {
    const {userId}  = await getCurrentUser()
    if(userId == null){
        return{
            error:true,
            message:"You don't have permisssion to do this"
        }
    }

    const interview = await getInterview(id,userId)
    if(interview == null){
        return{
            error:true,
            message:"You don't have permission to do this",
        }
    }

   await updateInterviewDb(id,data)
   return{error:false}
    
}

async function getJobInfo(id: string, userId: string) {
    "use cache"
    cacheTag(getJobInfoIdTag(id))

    return db.query.JobInfoTable.findFirst({
        where: and(eq(JobInfoTable.id, id), eq(JobInfoTable.userId, userId))
    })

}

async function getInterview(id: string, userId: string) {
  "use cache"
  cacheTag(getInterviewIdTag(id))

  const interview = await db.query.InterviewTable.findFirst({
    where: eq(InterviewTable.id, id),
    with: {
      jobInfo: {
        columns: {
          id: true,
          userId: true,
          description: true,
          title: true,
          experienceLevel: true,
        },
      },
    },
  })
  if (interview == null) return null

  cacheTag(getJobInfoIdTag(interview.jobInfo.id))
  if (interview.jobInfo.userId !== userId) return null

  return interview
}