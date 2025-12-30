import { ReactNode } from "react";
import { ClerkProvider as OrignalClerkProvider } from "@clerk/nextjs";

export function ClerkProvider({children}: {children: ReactNode}){
    return<OrignalClerkProvider>{children}</OrignalClerkProvider>
}