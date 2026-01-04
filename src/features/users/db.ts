import { db } from "@/drizzle/db"
import { UserTable } from "@/drizzle/schema"
import { eq } from "drizzle-orm"
import { revalidateUserCache } from "./dbCache"

export async function upsertUser(user: typeof UserTable.$inferInsert) {
  await db
    .insert(UserTable)
    .values(user)
    .onConflictDoUpdate({
      target: [UserTable.id],
      set: user,
    })

  revalidateUserCache(user.id)
}

export async function deleteUser(id: string) {
  await db.delete(UserTable).where(eq(UserTable.id, id))

  revalidateUserCache(id)
}