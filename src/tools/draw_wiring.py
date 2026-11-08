"""Create an original vector breadboard layout and matching printable PDF."""
from pathlib import Path
from html import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor as _HexColor
def HexColor(value):
    if len(value)==4:value='#'+''.join(ch*2 for ch in value[1:])
    return _HexColor(value)

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'interface'/'wiring'
OUT.mkdir(parents=True, exist_ok=True)
W,H=2800,1800
pdfmetrics.registerFont(TTFont('Arial',r'C:\Windows\Fonts\arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold',r'C:\Windows\Fonts\arialbd.ttf'))
c=canvas.Canvas(str(OUT/'PlantBand-UNO-R3-Wiring.pdf'),pagesize=(W/2,H/2))
c.setTitle('Plant Band - UNO R3 breadboard wiring')
c.scale(.5,.5)
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
RED='#cc353c';BLACK='#30343b';BLUE='#1767b6';PURPLE='#7b45b5';GREEN='#16836d';ORANGE='#cc7919';GRAY='#67717a'

def rect(x,y,w,h,fill='#fff',stroke=None,r=0,sw=2):
    svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{sw}"/>')
    c.setFillColor(HexColor(fill));c.setStrokeColor(HexColor(stroke or fill));c.setLineWidth(sw)
    c.roundRect(x,H-y-h,w,h,r,stroke=int(bool(stroke)),fill=1)
def line(points,color=BLACK,width=4):
    svg.append(f'<polyline points="{" ".join(f"{x},{y}" for x,y in points)}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>')
    c.setStrokeColor(HexColor(color));c.setLineWidth(width);c.setLineCap(1);c.setLineJoin(1)
    p=c.beginPath();p.moveTo(points[0][0],H-points[0][1])
    for x,y in points[1:]:p.lineTo(x,H-y)
    c.drawPath(p)
def circle(x,y,r,fill='#fff',stroke=None,sw=2):
    svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{sw}"/>')
    c.setFillColor(HexColor(fill));c.setStrokeColor(HexColor(stroke or fill));c.setLineWidth(sw);c.circle(x,H-y,r,stroke=int(bool(stroke)),fill=1)
def text(x,y,label,size=26,color=BLACK,bold=False,anchor='start'):
    svg.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="Arial, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" text-anchor="{anchor}">{escape(label)}</text>')
    c.setFillColor(HexColor(color));c.setFont('ArialBold' if bold else 'Arial',size)
    {'start':c.drawString,'middle':c.drawCentredString,'end':c.drawRightString}[anchor](x,H-y,label)
def wire(points,color):
    line(points,'#fff',13);line(points,color,7)
    for x,y in [points[0],points[-1]]:circle(x,y,6,color,'#fff',1.5)
def tag(x,y,label,color):
    width=pdfmetrics.stringWidth(label,'ArialBold',22)+18
    rect(x-9,y-23,width,30,'#fff',None,4);text(x,y,label,22,color,True)
def multi(x,y,lines,size=26,gap=38,color=BLACK):
    for i,label in enumerate(lines):text(x,y+i*gap,label,size,color)
def hole(row,col):
    return 730+29*(row-1),({'a':600,'b':624,'c':648,'d':672,'e':696,'f':744,'g':768,'h':792,'i':816,'j':840})[col]
def rail(n,which):return 710+(n-1)*35, {'+':530,'-':560,'b+':890,'b-':920}[which]
def resistor(row,value):
    x,y=hole(row,'e');_,yb=hole(row,'h')
    line([(x,y),(x,yb)],'#888',4);rect(x-12,y+23,24,50,'#e6cf9c',BLACK,5)
    for yy,color in [(y+32,'#86592d'),(y+43,'#111'),(y+57,'#c29f24')]:line([(x-10,yy),(x+10,yy)],color,5)
    circle(x,y,5,BLACK);circle(x,yb,5,BLACK);tag(x+45,y+53,value,BLACK)
def cap(row):
    x,y=hole(row,'d');xb,_=hole(row+1,'d');line([(x,y),(xb,y)],'#888',4)
    circle((x+xb)/2,y,10,'#c88935',BLACK,1)
    circle(x,y,4,BLACK);circle(xb,y,4,BLACK)

rect(0,0,W,H)
text(70,82,'Plant Band',66,bold=True)
text(70,132,'UNO R3  /  USB to laptop  /  five simultaneous inputs',32)
text(2730,82,'FULL BREADBOARD MAP',25,GRAY,True,'end')
text(2730,125,'Match pin labels on your actual modules.',25,GRAY,anchor='end')
line([(70,160),(2730,160)],BLACK,2)

# Laptop and USB data cable.
rect(90,215,355,185,'#f5f5f5',BLACK,12);rect(108,232,319,142,'#fff',BLACK,3)
text(267,290,'Plant Band',35,bold=True,anchor='middle');text(267,335,'laptop sound',25,anchor='middle')
line([(72,402),(465,402)],BLACK,12)
wire([(120,405),(120,465),(90,465),(90,555)],GRAY)
tag(135,449,'USB data cable',GRAY)

# Arduino full board, USB on left, analog + power headers along bottom.
rect(65,510,495,350,'#1d7c83',None,18)
for x,y in [(87,530),(530,533),(85,838),(530,838)]:circle(x,y,10,'#e7ebe7')
rect(45,548,85,86,'#c9d0d2',BLACK,5);text(88,599,'USB',21,BLACK,True,'middle')
rect(55,735,86,66,'#222',None,6);circle(64,769,20,'#080808','#aaa',3)
text(330,635,'UNO R3',42,'#fff',True,'middle');text(330,675,'ATmega328P',25,'#fff',False,'middle')
rect(234,700,235,55,'#222',None,3)
for x in range(245,467,17):line([(x,692),(x,700)],'#bbb',5);line([(x,755),(x,763)],'#bbb',5)
for i,label in enumerate(['SCL','SDA','AREF','GND','13','12','11','10','9','8','7','6','5','4','3','2','1','0']):
    x=173+i*20;rect(x-6,531,12,12,'#151515');text(x,566,label,10,'#fff',False,'middle')
for i,label in enumerate(['NC','IOREF','RST','3V3','5V','GND','GND','VIN']):
    x=153+i*22;rect(x-7,819,14,16,'#151515');text(x,809,label,12,'#fff',False,'middle')
pins={}
for i in range(6):
    x=365+i*29;pins['A'+str(i)]=(x,827);rect(x-7,819,14,16,'#151515');text(x,809,'A'+str(i),17,'#fff',True,'middle')
pins['5V']=(241,827);pins['GND']=(263,827)

# A rotated 400-point, 30-row breadboard. Rail holes are numbered separately.
rect(650,480,1000,485,'#f8f8f5','#ccc',18)
rect(704,711,900,18,'#e5e5df',None,5)
for col in 'abcdefghij':
    _,y=hole(1,col);text(686,y+7,col,21,GRAY,False,'middle')
for n in range(1,31):
    x,_=hole(n,'a');text(x,588,str(n),15,GRAY,False,'middle');text(x,873,str(n),15,GRAY,False,'middle')
    for col in 'abcdefghij':
        x,y=hole(n,col);rect(x-4,y-4,8,8,'#b9bcb9',None,1)
for which,color in [('+',RED),('-',BLACK),('b+',RED),('b-',BLACK)]:
    _,y=rail(1,which);line([(700,y-12),(1570,y-12)],color,2)
    text(680,y+7,'+' if '+' in which else '−',26,color,True,'middle')
    for n in range(1,26):x,yy=rail(n,which);rect(x-4,yy-4,8,8,'#aaa',None,1)
text(1140,995,'30-row breadboard: a-e share a row; f-j form a separate row.',24,GRAY,anchor='middle')

# Power distribution, including visible bridges to the lower rails.
wire([pins['5V'],(241,1010),(590,1010),(590,530),rail(1,'+')],RED)
wire([pins['GND'],(263,1030),(610,1030),(610,560),rail(1,'-')],BLACK)
tag(155,1000,'5V',RED);tag(145,1055,'GND',BLACK)
wire([rail(25,'+'),(1670,530),(1670,890),rail(25,'b+')],RED)
wire([rail(25,'-'),(1700,560),(1700,920),rail(25,'b-')],BLACK)
tag(1430,1030,'Power rail bridges',BLACK)

# Sensor housings and leads, physically separate from the board.
text(820,224,'1  Bend the stem',29,bold=True,anchor='middle')
rect(745,260,195,51,'#c2a682',BLACK,4)
for x in range(757,929,14):line([(x,266),(x,304)],'#685846',4)
text(840,348,'Flex sensor',24,anchor='middle')
wire([(765,310),(765,388),(817,388),hole(4,'a')],RED)
wire([(920,310),(920,400),(904,400),hole(7,'a')],PURPLE)
wire([rail(4,'+'),(815,577),(817,577),hole(4,'b')],RED)

text(1150,224,'2  Pinch a leaf',29,bold=True,anchor='middle')
circle(1150,290,53,'#333',BLACK,2);circle(1150,290,42,'#777')
rect(1138,340,25,60,'#b6ac7a',BLACK,1)
text(1235,300,'FSR',26,bold=True)
wire([(1144,399),(1144,420),(1107,420),hole(14,'a')],RED)
wire([(1159,399),(1159,432),(1194,432),hole(17,'a')],ORANGE)
wire([rail(12,'+'),(1095,578),(1107,578),hole(14,'b')],RED)

text(1510,224,'3  Tilt the pot',29,bold=True,anchor='middle')
rect(1340,260,340,165,'#2b5750',BLACK,8)
text(1510,298,'Adafruit MPU6050',28,'#fff',True,'middle')
text(1510,333,'in the pot • 0x68',24,'#fff',False,'middle')
for x,label,color in [(1368,'VIN',RED),(1430,'GND',BLACK),(1492,'SDA',GREEN),(1554,'SCL',ORANGE)]:
    text(x,387,label,20,'#fff',True,'middle');circle(x,425,6,color)
wire([(1368,425),(1368,448),(1410,448),rail(21,'+')],RED)
wire([(1430,425),(1430,440),(1445,440),rail(22,'-')],BLACK)
wire([(1492,425),(1492,465),(1397,465),hole(24,'a')],GREEN)
wire([(1554,425),(1554,478),(1484,478),hole(27,'a')],ORANGE)

# Passive components and the two divider ground returns.
resistor(7,'47 kΩ');resistor(17,'10 kΩ');cap(7);cap(17)
wire([hole(7,'j'),(904,920),rail(7,'b-')],BLACK)
wire([hole(17,'j'),(1194,920),rail(15,'b-')],BLACK)
wire([hole(8,'b'),(933,920),rail(8,'b-')],BLACK)
wire([hole(18,'b'),(1223,920),rail(16,'b-')],BLACK)

# Two analog wires. A1 is free; both digital sensors share A4/A5.
wire([pins['A0'],(365,1070),(620,1070),(620,648),hole(7,'c')],PURPLE)
wire([pins['A2'],(423,1050),(640,1050),(640,624),hole(17,'c')],ORANGE)
# Last segment of A2 routes diagonally from b-height to c17; it is a single wire.
tag(700,657,'A0 → c7',PURPLE);tag(1040,614,'A2 → c17',ORANGE)
tag(898,704,'C1',GRAY);tag(1190,704,'C2',GRAY)

# MPR121, drawn by functional labels because breakout pin order varies.
text(2090,224,'4 + 5  Touch',29,bold=True,anchor='middle')
text(2090,267,'MPR121 • address 0x5A',28,anchor='middle')
rect(1880,490,400,340,'#466a85',None,12)
text(2080,534,'MPR121',34,'#fff',True,'middle');rect(2010,620,95,95,'#222',None,3)
mpr={}
for label,y in [('VIN',580),('GND',630),('SDA',680),('SCL',730)]:
    mpr[label]=(1880,y);circle(1880,y,9,'#e5d4a1');text(1900,y+8,label,25,'#fff',True)
for label,y in [('E0',590),('E1',740)]:
    mpr[label]=(2280,y);circle(2280,y,9,'#e5d4a1');text(2256,y+8,label,25,'#fff',True,'end')
text(2080,798,'IRQ / ADDR: leave unconnected',20,'#fff',False,'middle')
wire([rail(23,'+'),(1740,530),(1740,580),mpr['VIN']],RED)
wire([rail(23,'-'),(1770,560),(1770,630),mpr['GND']],BLACK)
wire([pins['A4'],(481,1130),(1725,1130),(1725,648),hole(24,'c')],GREEN)
wire([pins['A5'],(510,1160),(1755,1160),(1755,672),hole(27,'d')],ORANGE)
wire([hole(24,'e'),(1785,696),(1785,680),mpr['SDA']],GREEN)
wire([hole(27,'b'),(1815,624),(1815,730),mpr['SCL']],ORANGE)
tag(1270,642,'A4 → c24',GREEN);tag(1495,667,'A5 → d27',ORANGE)
tag(1190,1120,'A4 → shared SDA',GREEN);tag(1390,1188,'A5 → shared SCL',ORANGE)

# Two distinct copper touch pads. No electrical connection through soil or pot.
line([(2515,410),(2480,500),(2520,620)],'#6b8245',17)
rect(2474,494,37,70,'#bb7943',BLACK,4)
wire([mpr['E0'],(2370,590),(2370,528),(2474,528)],GREEN)
text(2510,355,'Stem pad',29,bold=True,anchor='middle');text(2510,390,'Copper → E0',25,anchor='middle')
rect(2410,765,230,215,'#6b5262',BLACK,55);rect(2430,746,190,48,'#55424e',BLACK,15)
rect(2487,825,74,76,'#bb7943',BLACK,5)
wire([mpr['E1'],(2350,740),(2350,862),(2487,862)],PURPLE)
text(2525,1030,'Separate pot pad',29,bold=True,anchor='middle');text(2525,1070,'Copper → E1',25,anchor='middle')
multi(1900,893,['Use a verified 5V-safe breakout.', 'For Adafruit: 5V → VIN, not 3V.', '3.3V-only boards need 3.3V power', 'and suitable I²C level shifting.'],25,36)

# Key and exact hole recipes. These make crossings and placement unambiguous.
line([(70,1225),(2730,1225)],BLACK,2)
text(70,1280,'Build in this order',34,bold=True)
multi(70,1330,['1. Unplug USB; connect 5V and GND rails.', '2. Join the top and bottom power rails.', '3. Add the flex and FSR dividers below.', '4. Join both sensors to SDA/SCL; add pads.', '5. Plug in; Connect Arduino; calibrate.'],26,44)
multi(70,1590,['A1 is unused. No piezo is needed.', 'Wire ends with dots are the actual connections.', 'Crossing wires do not join unless a dot is shown.'],24,36)

text(965,1280,'Exact breadboard holes',34,bold=True)
multi(965,1330,['Flex: leads a4 / a7. + rail → b4.', 'A0 → c7. 47 kΩ: e7 → h7. j7 → GND.', 'C1: d7 → d8; b8 → GND.', 'FSR: leads a14 / a17. + rail → b14.', 'A2 → c17. 10 kΩ: e17 → h17. j17 → GND.', 'C2: d17 → d18; b18 → GND.', 'SDA: A4 → c24; MPU → a24; MPR → e24.', 'SCL: A5 → d27; MPU → a27; MPR → b27.'],25,38)
text(965,1675,'C1 / C2 = 100 nF ceramic (non-polarized).',24,GRAY)

text(1910,1280,'Before playing',34,bold=True)
multi(1910,1330,['Fix the MPU6050 firmly to a dry part of the pot.', 'Set upright while still; then set a gentle full tilt.', 'MPU: VIN → 5V, GND → GND. INT unused.', 'Leave AD0 low/default for address 0x68.', 'Keep stem and pot touch pads separate.', 'Check rail continuity; bridge any split rails.', 'Module pin positions vary: follow printed labels.'],25,42)
text(1910,1668,'All sounds come from the laptop.',28,bold=True)

line([(70,1720),(2730,1720)],'#ccc',2)
text(70,1760,'Original connection layout • UNO R3 • PlantBandUSB.ino • 115200 baud',22,GRAY)
text(2730,1760,'References: Arduino UNO R3 + Adafruit MPR121 / MPU6050 pinouts',22,GRAY,anchor='end')
svg.append('</svg>')
(OUT/'PlantBand-UNO-R3-Wiring.svg').write_text('\n'.join(svg),encoding='utf-8')
c.showPage();c.save()
print(OUT/'PlantBand-UNO-R3-Wiring.pdf')
