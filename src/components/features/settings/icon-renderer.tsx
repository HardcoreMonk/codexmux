import { createElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Globe, Link, ExternalLink, Bookmark, Star,
  Home, FileText, BarChart3, PieChart, LineChart,
  Activity, Zap, Terminal, Code, Database,
  Server, Cloud, Shield, Lock, Key,
  User, Users, Mail, MessageSquare, Bell,
  Calendar, Clock, Search, Eye, Camera,
  Image, Film, Music, Headphones, Mic,
  Folder, File, Archive, Download, Upload,
  GitBranch, GitCommit, GitPullRequest, GitFork, Bug,
  Wrench, Settings, Sliders, Palette, Brush,
  Map, MapPin, Navigation, Compass, Wifi,
  Monitor, Smartphone, Tablet, Laptop, Cpu,
  HardDrive, MemoryStick, CircuitBoard, Radio, Bluetooth,
  Heart, ThumbsUp, Smile, Coffee, Rocket,
  Flame, Sun, Moon, Sparkles, Award,
  Trophy, Target, Flag, Crosshair, Layers,
  Layout, Grid, List, Table, Kanban,
  Bot, Brain, Lightbulb, GraduationCap, BookOpen,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Globe, Link, ExternalLink, Bookmark, Star,
  Home, FileText, BarChart3, PieChart, LineChart,
  Activity, Zap, Terminal, Code, Database,
  Server, Cloud, Shield, Lock, Key,
  User, Users, Mail, MessageSquare, Bell,
  Calendar, Clock, Search, Eye, Camera,
  Image, Film, Music, Headphones, Mic,
  Folder, File, Archive, Download, Upload,
  GitBranch, GitCommit, GitPullRequest, GitFork, Bug,
  Wrench, Settings, Sliders, Palette, Brush,
  Map, MapPin, Navigation, Compass, Wifi,
  Monitor, Smartphone, Tablet, Laptop, Cpu,
  HardDrive, MemoryStick, CircuitBoard, Radio, Bluetooth,
  Heart, ThumbsUp, Smile, Coffee, Rocket,
  Flame, Sun, Moon, Sparkles, Award,
  Trophy, Target, Flag, Crosshair, Layers,
  Layout, Grid, List, Table, Kanban,
  Bot, Brain, Lightbulb, GraduationCap, BookOpen,
};

const getIcon = (name: string): LucideIcon | undefined => ICON_MAP[name];

interface IIconRendererProps {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}

const IconRenderer = ({ name, className, style }: IIconRendererProps) => {
  const icon = ICON_MAP[name];
  if (!icon) return null;
  return createElement(icon, { className, style });
};

export { getIcon };
export default IconRenderer;
