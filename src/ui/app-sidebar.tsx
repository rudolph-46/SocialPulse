"use client";

import * as React from "react";
import {
  Calendar,
  CreditCard,
  ImageIcon,
  LayoutDashboard,
  MessageSquare,
  Settings2,
  Share2,
  BarChart3,
} from "lucide-react";

import { NavMain } from "@/ui/nav-main";
import { NavProjects } from "@/ui/nav-projects";
import { NavUser } from "@/ui/nav-user";
import { TeamSwitcher } from "@/ui/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/ui/sidebar";

const data = {
  teams: [
    {
      name: "SocialPulse",
      logo: Share2,
      plan: "Community Manager IA",
    },
  ],
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      isActive: true,
      items: [
        {
          title: "Overview",
          url: "/dashboard",
        },
        {
          title: "Analytics",
          url: "/dashboard",
        },
      ],
    },
    {
      title: "Calendrier",
      url: "/dashboard",
      icon: Calendar,
      items: [
        {
          title: "Vue semaine",
          url: "/dashboard",
        },
        {
          title: "Vue mois",
          url: "/dashboard",
        },
        {
          title: "Historique",
          url: "/dashboard",
        },
      ],
    },
    {
      title: "Contenu",
      url: "/dashboard",
      icon: ImageIcon,
      items: [
        {
          title: "Banque photos",
          url: "/dashboard",
        },
        {
          title: "Images IA",
          url: "/dashboard",
        },
        {
          title: "Hashtags",
          url: "/dashboard",
        },
      ],
    },
    {
      title: "Commentaires",
      url: "/dashboard",
      icon: MessageSquare,
      items: [
        {
          title: "Inbox",
          url: "/dashboard",
        },
        {
          title: "Base de connaissance",
          url: "/dashboard",
        },
      ],
    },
    {
      title: "Paramètres",
      url: "/dashboard/settings",
      icon: Settings2,
      items: [
        {
          title: "Général",
          url: "/dashboard/settings",
        },
        {
          title: "Facturation",
          url: "/dashboard/settings/billing",
        },
      ],
    },
  ],
  projects: [
    {
      name: "Canaux connectés",
      url: "/dashboard",
      icon: Share2,
    },
    {
      name: "Crédits",
      url: "/dashboard/settings/billing",
      icon: CreditCard,
    },
    {
      name: "Performances",
      url: "/dashboard",
      icon: BarChart3,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
