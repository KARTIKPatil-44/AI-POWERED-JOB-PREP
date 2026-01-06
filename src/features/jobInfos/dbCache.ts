
import { getGlobalTag, getIdTag, getUserTag } from "@/lib/dataCache"
import { revalidateTag } from "next/cache"

export function getJobInfoGlobalTag() {
  return getGlobalTag("jobInfos")
}

export function getJobInfoUserTag(userId: string) {
  return getUserTag("jobInfos", userId)
}

export function getJobInfoIdTag(id: string) {
  return getIdTag("jobInfos", id)
}

export async function revalidateJobInfoCache({
  id,
  userId,
}: {
  id: string
  userId: string
}) {
  revalidateTag(getJobInfoGlobalTag(), "default")
  revalidateTag(getJobInfoUserTag(userId), "default")
  revalidateTag(getJobInfoIdTag(id), "default")
}
