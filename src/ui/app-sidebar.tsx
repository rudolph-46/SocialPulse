"use client";

import * as React from "react";
import {
  Calendar,
  CreditCard,
  ImageIcon,
  LayoutDashboard,
  Settings2,
  Share2,
} from "lucide-react";

import { NavUser } from "@/ui/nav-user";
import { TeamSwitcher } from "@/ui/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Calendrier", url: "/dashboard/calendars", icon: Calendar },
  { title: "Banque photos", url: "/dashboard/photos", icon: ImageIcon },
  { title: "Crédits", url: "/dashboard/credits", icon: CreditCard },
  { title: "Paramètres", url: "/dashboard/settings", icon: Settings2 },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher
          teams={[
            {
              name: "SocialPulse",
              logo: Share2,
              plan: "Community Manager IA",
            },
          ]}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title}>
                  <a href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
