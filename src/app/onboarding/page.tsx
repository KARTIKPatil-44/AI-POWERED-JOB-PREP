
import { redirect } from "next/navigation";
import { OnboardingClient } from "./_client";
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser";

export default async function OnboardingPage() {
    const { userId, user } = await getCurrentUser({allData: true })

    if(userId == null)  return redirect("/")
    if(userId != null) return redirect("/app")

    
    return <div className=" container flex flex-col items-center justify-center h-screen gap-4
    ">
        <h1 className="text-4xl">Creating your account...</h1>
        <OnboardingClient userId={userId}/>
    </div>

}