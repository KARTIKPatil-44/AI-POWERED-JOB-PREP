"use client"

import { Bot, LogOut, User } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SignOutButton, useClerk } from "@clerk/nextjs"
import { ThemeToggle } from "@/components/ThemeToggle"
import Link from "next/link"
import { UserAvatar } from "@/components/UserAvatar"

export function Navbar({
  user,
}: {
  user: {
    name: string
    imageUrl: string
  }
}) {
  const { signOut, openUserProfile } = useClerk()

  return (
    <nav className="h-header border-b">
      <div className="container flex h-full items-center justify-between">
        {/* Left side - Logo and App Name */}
        <Link href="/app" className="flex items-center gap-2">
          <Bot className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold">PrepWise</span>
        </Link>

        {/* Right side - Theme Toggle and User Menu */}
        <div className="flex items-center gap-4">
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <UserAvatar user={user} />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  openUserProfile()
                }}
              >
                <User className="mr-2" />
                Profile
              </DropdownMenuItem>

              <SignOutButton>
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="mr-2" />
                  Logout
                </DropdownMenuItem>
              </SignOutButton>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
}
