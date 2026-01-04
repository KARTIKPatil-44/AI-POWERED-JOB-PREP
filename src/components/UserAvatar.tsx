import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"

export function UserAvatar({
  user,
  ...props
}: {
  user: { name: string; imageUrl: string }
} & React.ComponentProps<typeof Avatar>) {
  return (
    <Avatar className="h-8 w-8" {...props}>
      <AvatarImage
        src={user.imageUrl}
        alt={user.name}
      />
      <AvatarFallback className="uppercase text-sm">
        {user.name
          .split(" ")
          .slice(0, 2)
          .map((n) => n[0])
          .join("")}
      </AvatarFallback>
    </Avatar>
  )
}
