using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;

// Native operations are bounded and re-check the foreground window before every input.
public static class UncleComputer {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a,uint b,bool attach);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h,int command);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h,int index);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Position p);
  [StructLayout(LayoutKind.Sequential)] struct Position {public int X,Y;}
  public static object Cursor(){Position p;GetCursorPos(out p);return new{x=p.X,y=p.Y,leftDown=(GetAsyncKeyState(1)&0x8000)!=0,controlDown=(GetAsyncKeyState(0x11)&0x8000)!=0,shiftDown=(GetAsyncKeyState(0x10)&0x8000)!=0,altDown=(GetAsyncKeyState(0x12)&0x8000)!=0};}
  [DllImport("user32.dll")] static extern uint SendInput(uint count, Input[] input, int size);
  [DllImport("user32.dll")] static extern void SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct Input { public uint type; public Union data; }
  [StructLayout(LayoutKind.Explicit)] struct Union { [FieldOffset(0)] public Mouse mouse; [FieldOffset(0)] public Key key; }
  [StructLayout(LayoutKind.Sequential)] struct Mouse { public int x,y; public uint data,flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct Key { public ushort vk,scan; public uint flags,time; public UIntPtr extra; }
  static Dictionary<int, AutomationElement> targets = new Dictionary<int, AutomationElement>();
  static IntPtr lastWindow;
  static int ownPid;
  static string cancelFile;
  [DllImport("powrprof.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.U1)] static extern bool SetSuspendState([MarshalAs(UnmanagedType.U1)]bool hibernate,[MarshalAs(UnmanagedType.U1)]bool force,[MarshalAs(UnmanagedType.U1)]bool disableWake);
  public static object Sleep(){Cancelled();if(!SetSuspendState(false,false,false))throw new Exception("Windows ปฏิเสธการพักเครื่อง");return new{ok=true};}
  static bool Secret(AutomationElement e) {var c=e.Current;return c.IsPassword || ((c.ControlType==ControlType.Edit || c.ControlType==ControlType.Document) && System.Text.RegularExpressions.Regex.IsMatch(c.Name??"",@"password|passcode|card.?number|credit.?card|cvv|cvc|รหัสผ่าน|เลขบัตร|\botp\b",System.Text.RegularExpressions.RegexOptions.IgnoreCase));}
  public static void Init(int owner,string cancel) { ownPid=owner;cancelFile=cancel;SetProcessDPIAware(); }
  static int Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h,out p); return (int)p; }
  static bool Allowed(IntPtr h) { return h != IntPtr.Zero && IsWindow(h) && IsWindowVisible(h) && Pid(h)!=ownPid && Pid(h)!=Process.GetCurrentProcess().Id; }
  static object Window(IntPtr h) {
    var e=AutomationElement.FromHandle(h); Rect r; GetWindowRect(h,out r);
    return new { window=h.ToInt64(), title=e.Current.Name, process=Process.GetProcessById(Pid(h)).ProcessName, processId=Pid(h), x=r.Left,y=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top };
  }
  public static object Windows() {
    var list=new List<object>(); EnumWindows(delegate(IntPtr h,IntPtr p) { try { if(Allowed(h) && list.Count<40) { var e=AutomationElement.FromHandle(h); if(!String.IsNullOrWhiteSpace(e.Current.Name)) list.Add(Window(h)); } } catch {} return true; },IntPtr.Zero); return list;
  }
  public static object Picture(long window) {
    var h=new IntPtr(window);Check(h);Rect r;GetWindowRect(h,out r);int w=r.Right-r.Left,ht=r.Bottom-r.Top;
    if(w<1||ht<1||w>8000||ht>8000)throw new Exception("ขนาดหน้าต่างไม่รองรับ");
    using(var bitmap=new System.Drawing.Bitmap(w,ht)) {
      using(var g=System.Drawing.Graphics.FromImage(bitmap))g.CopyFromScreen(r.Left,r.Top,0,0,new System.Drawing.Size(w,ht));
      double scale=Math.Min(1,1280.0/Math.Max(w,ht));
      using(var small=new System.Drawing.Bitmap(bitmap,new System.Drawing.Size(Math.Max(1,(int)(w*scale)),Math.Max(1,(int)(ht*scale)))))
      using(var stream=new System.IO.MemoryStream()) {small.Save(stream,System.Drawing.Imaging.ImageFormat.Jpeg);return new {data=Convert.ToBase64String(stream.ToArray()),width=small.Width,height=small.Height};}
    }
  }
  public static object Read(long requested) {
    targets.Clear(); IntPtr h=new IntPtr(requested);
    if(requested==0) h=GetForegroundWindow();
    if(!Allowed(h)) { h=IntPtr.Zero; EnumWindows(delegate(IntPtr w,IntPtr p) { try { if(Allowed(w) && !String.IsNullOrWhiteSpace(AutomationElement.FromHandle(w).Current.Name)) {h=w;return false;} } catch {} return true; },IntPtr.Zero); }
    if(!Allowed(h)) throw new Exception("ไม่พบหน้าต่างเป้าหมาย");
    lastWindow=h; var root=AutomationElement.FromHandle(h); var rows=new List<object>();
    var queue=new Queue<AutomationElement>();queue.Enqueue(root); int visited=0; var watch=Stopwatch.StartNew();
    while(queue.Count>0 && rows.Count<100 && visited++<650 && watch.ElapsedMilliseconds<2500) {
      var e=queue.Dequeue();try {
        var c=e.Current; var role=c.ControlType.ProgrammaticName.Replace("ControlType.","");
        if(!c.IsOffscreen && c.IsEnabled && (role=="Edit" || role=="Document" || role=="Button" || role=="MenuItem" || role=="Hyperlink" || role=="CheckBox" || role=="ComboBox" || role=="TabItem" || role=="ListItem" || role=="Text" || role=="Slider" || role=="TreeItem" || role=="DataItem" || role=="RadioButton" || role=="ScrollBar" || role=="Spinner")) {
          var b=c.BoundingRectangle; int id=rows.Count+1;targets[id]=e;
          string value="";object pattern;
          bool secret=Secret(e);
          if(!secret) {
            if(e.TryGetCurrentPattern(ValuePattern.Pattern,out pattern)) value=((ValuePattern)pattern).Current.Value;
            else if((role=="Document" || role=="Edit") && e.TryGetCurrentPattern(TextPattern.Pattern,out pattern)) value=((TextPattern)pattern).DocumentRange.GetText(1500);
          }
          if(value.Length>1500)value=value.Substring(0,1500);
          rows.Add(new { id=id,identity=String.Join(",",e.GetRuntimeId()),role=role,name=secret?"[private field]":c.Name,value=value,secret=secret,focused=c.HasKeyboardFocus,multiline=role=="Document" || (role=="Edit" && c.NativeWindowHandle!=0 && (GetWindowLong(new IntPtr(c.NativeWindowHandle),-16)&4)!=0),x=(int)b.X,y=(int)b.Y,width=(int)b.Width,height=(int)b.Height });
        }
        var walker=TreeWalker.ControlViewWalker;var child=walker.GetFirstChild(e);int siblings=0;
        while(child!=null && siblings++<100) {queue.Enqueue(child);child=walker.GetNextSibling(child);}
      } catch {} 
    }
    return new { app=Window(h),foreground=GetForegroundWindow().ToInt64(),targets=rows };
  }
  static void Cancelled(){if(!String.IsNullOrEmpty(cancelFile)&&System.IO.File.Exists(cancelFile))throw new Exception("หยุดแล้ว");if((GetAsyncKeyState(0x1B)&0x8000)!=0)throw new Exception("หยุดด้วย Escape");}
  static void Check(IntPtr h) { Cancelled();if(!IsWindow(h))throw new Exception("หน้าต่างปิดไปแล้ว");if(!IsWindowVisible(h))throw new Exception("หน้าต่างถูกซ่อน กรุณาเปิดให้เห็นก่อนเริ่ม");if(Pid(h)==ownPid || Pid(h)==Process.GetCurrentProcess().Id)throw new Exception("ไม่ควบคุมหน้าต่างของ Rocky เอง");if(GetForegroundWindow()!=h)throw new Exception("หน้าต่างเปลี่ยนแล้ว กรุณาอ่านหน้าจอใหม่"); }
  static void Inputs(Input[] a) { if(SendInput((uint)a.Length,a,Marshal.SizeOf(typeof(Input)))!=a.Length)throw new Exception("Windows ปฏิเสธการควบคุม อาจเป็นหน้าต่างผู้ดูแลระบบ"); }
  static Input K(ushort vk,ushort scan,uint flags) { return new Input {type=1,data=new Union {key=new Key {vk=vk,scan=scan,flags=flags}}}; }
  static void MouseClick(uint down,uint up) { Inputs(new[]{new Input {type=0,data=new Union{mouse=new Mouse{flags=down}}},new Input{type=0,data=new Union{mouse=new Mouse{flags=up}}}}); }
  public static object Act(string action,long window,int target,int x,int y,string text,int endX,int endY,int duration) {
    var h=new IntPtr(window);if(!Allowed(h))throw new Exception("หน้าต่างปิดไปแล้ว");
    if(action=="focus") {
      uint ignored,here=GetCurrentThreadId(),front=GetWindowThreadProcessId(GetForegroundWindow(),out ignored),there=GetWindowThreadProcessId(h,out ignored);
      bool a=false,b=false;
      try {if(front!=0 && front!=here)a=AttachThreadInput(here,front,true);if(there!=here && there!=front)b=AttachThreadInput(here,there,true);if(IsIconic(h))ShowWindowAsync(h,9);BringWindowToTop(h);SetForegroundWindow(h);}
      finally{if(b)AttachThreadInput(here,there,false);if(a)AttachThreadInput(here,front,false);}
      if(GetForegroundWindow()!=h) {try{AutomationElement.FromHandle(h).SetFocus();}catch{}}
      Thread.Sleep(180);Check(h);return new {ok=true};
    }
    Check(h);if(action=="minimize"){ShowWindowAsync(h,6);return new{ok=true};}if(action=="close"){PostMessage(h,0x10,IntPtr.Zero,IntPtr.Zero);return new{ok=true};}if(h!=lastWindow)throw new Exception("ต้องอ่านหน้าต่างก่อนลงมือ");
    AutomationElement e=null;
    if(target>0) {if(!targets.TryGetValue(target,out e))throw new Exception("ไม่พบปุ่มเป้าหมาย");var c=e.Current;if(Secret(e))throw new Exception("กรุณากรอกรหัสผ่านด้วยตนเอง");if(!c.IsEnabled || c.IsOffscreen)throw new Exception("ปุ่มเป้าหมายยังใช้งานไม่ได้");var r=c.BoundingRectangle;x=(int)(r.X+r.Width/2);y=(int)(r.Y+r.Height/2);}
    if(action=="click" || action=="double_click" || action=="triple_click" || action=="middle_click" || action=="right_click" || action=="scroll" || action=="drag" || action=="mouse_move") {
      Rect b;GetWindowRect(h,out b);if(x<b.Left||x>=b.Right||y<b.Top||y>=b.Bottom)throw new Exception("พิกัดอยู่นอกหน้าต่างเป้าหมาย");
      // Coordinate fallback also refuses password controls under the pointer.
      var at=AutomationElement.FromPoint(new System.Windows.Point(x,y));if(at==null || at.Current.ProcessId!=Pid(h))throw new Exception("มีหน้าต่างอื่นบังเป้าหมาย กรุณาปิดก่อนทำต่อ");for(int i=0;at!=null && i<8;i++,at=TreeWalker.ControlViewWalker.GetParent(at))if(Secret(at))throw new Exception("กรุณากรอกรหัสผ่านด้วยตนเอง");
      Check(h);SetCursorPos(x,y);
      if(action=="mouse_move")return new{ok=true};
      if(action=="drag") {
        if(endX<b.Left||endX>=b.Right||endY<b.Top||endY>=b.Bottom)throw new Exception("ปลายทางอยู่นอกหน้าต่าง");
        var dest=AutomationElement.FromPoint(new System.Windows.Point(endX,endY));if(Secret(dest))throw new Exception("ไม่ลากไปช่องข้อมูลส่วนตัว");
        int sx=x,sy=y;duration=Math.Max(100,Math.Min(3000,duration));
        try{Inputs(new[]{new Input{type=0,data=new Union{mouse=new Mouse{flags=2}}}});for(int i=1;i<=30;i++){Check(h);SetCursorPos(sx+(endX-sx)*i/30,sy+(endY-sy)*i/30);Thread.Sleep(duration/30);}}
        finally{Inputs(new[]{new Input{type=0,data=new Union{mouse=new Mouse{flags=4}}}});}
      } else if(action=="scroll")Inputs(new[]{new Input{type=0,data=new Union{mouse=new Mouse{flags=(text=="left"||text=="right")?0x1000u:0x800u,data=unchecked((uint)((text=="up"||text=="right")?360:-360))}}}});
      else {MouseClick(action=="right_click"?8u:action=="middle_click"?32u:2u,action=="right_click"?16u:action=="middle_click"?64u:4u);int more=action=="triple_click"?2:action=="double_click"?1:0;for(int i=0;i<more;i++){Thread.Sleep(80);Check(h);MouseClick(2,4);}}
    } else if(action=="type") {
      if(e!=null)e.SetFocus();Check(h);var focused=AutomationElement.FocusedElement;if(focused==null||Secret(focused)||Pid(h)!=focused.Current.ProcessId)throw new Exception("ช่องกรอกไม่ถูกต้อง");
      foreach(char c in text??"") {Check(h);Inputs(new[]{K(0,c,4),K(0,c,6)});}
    } else if(action=="key" || action=="hold_key" || action=="hold_and_press") {
      var focused=AutomationElement.FocusedElement;if(focused!=null && Secret(focused) && text!="TAB" && text!="SHIFT+TAB" && text!="ESC")throw new Exception("กรุณากรอกรหัสผ่านด้วยตนเอง");
      var map=new Dictionary<string,ushort>{{"CTRL",0x11},{"ALT",0x12},{"SHIFT",0x10},{"ENTER",0x0D},{"TAB",9},{"ESC",0x1B},{"BACKSPACE",8},{"SPACE",32},{"UP",38},{"DOWN",40},{"LEFT",37},{"RIGHT",39},{"HOME",36},{"END",35},{"PAGEUP",33},{"PAGEDOWN",34},{"A",65},{"C",67},{"V",86},{"X",88},{"Z",90},{"Y",89},{"S",83},{"F",70},{"L",76},{"W",87},{"T",84},{"F4",0x73},{"F5",0x74}};
      map["WIN"]=0x5B;map["DELETE"]=0x2E;map["INSERT"]=0x2D;map["PRINTSCREEN"]=0x2C;map["PLUS"]=0xBB;map["MINUS"]=0xBD;map["PERIOD"]=0xBE;
      for(char letter='A';letter<='Z';letter++)map[letter.ToString()]=letter;
      for(char number='0';number<='9';number++)map[number.ToString()]=number;
      for(int f=1;f<=12;f++)map["F"+f]=(ushort)(0x6F+f);
      if(action=="hold_and_press") {
        var pair=(text??"").Split('|');if(pair.Length!=2)throw new Exception("ระบุคีย์ที่กดค้างและคีย์ที่กด");
        Func<string,List<ushort>> parse=s=>{var l=new List<ushort>();foreach(string n in s.ToUpperInvariant().Split('+')){ushort k;if(!map.TryGetValue(n,out k))throw new Exception("คีย์นี้ยังไม่รองรับ");l.Add(k);}return l;};
        var held=parse(pair[0]);var tap=parse(pair[1]);duration=Math.Max(50,Math.Min(3000,duration));
        try{foreach(ushort k in held)Inputs(new[]{K(k,0,0)});Thread.Sleep(60);var press=new List<Input>();foreach(ushort k in tap)press.Add(K(k,0,0));for(int i=tap.Count-1;i>=0;i--)press.Add(K(tap[i],0,2));Check(h);Inputs(press.ToArray());for(int i=0;i<duration;i+=20){Check(h);Thread.Sleep(20);}}
        finally{held.Reverse();foreach(ushort k in held)Inputs(new[]{K(k,0,2)});}
        return new{ok=true};
      }
      var names=(text??"").ToUpperInvariant().Split('+');var keys=new List<ushort>();foreach(string n in names){ushort k;if(!map.TryGetValue(n,out k))throw new Exception("คีย์นี้ยังไม่รองรับ");keys.Add(k);}
      if(action=="hold_key"){duration=Math.Max(50,Math.Min(3000,duration));try{foreach(ushort k in keys)Inputs(new[]{K(k,0,0)});for(int i=0;i<duration;i+=20){Check(h);Thread.Sleep(20);}}finally{keys.Reverse();foreach(ushort k in keys)Inputs(new[]{K(k,0,2)});}return new{ok=true};}
      var batch=new List<Input>();foreach(ushort k in keys)batch.Add(K(k,0,0));keys.Reverse();foreach(ushort k in keys)batch.Add(K(k,0,2));Check(h);Inputs(batch.ToArray());
    } else throw new Exception("ไม่รู้จักคำสั่งควบคุม");
    return new {ok=true};
  }
}
