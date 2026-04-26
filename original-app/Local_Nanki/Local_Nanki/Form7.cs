using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Local_Nanki
{
    public partial class Form7 : Form
    {
        public Form7(DataSet d1, DataSet d2, string aa, DataTable d3, DataTable d4, DataTable d5, DataTable d6)
        {
            InitializeComponent();
            ds_1 = d1;
            ds_2 = d2;
            Zeiritu = aa;
            dt_3 = d3;
            dt_4 = d4;
            dt_5 = d5;
            dt_6 = d6;
        }

        private DataSet ds_1;
        private DataTable dt_1;
        private DataSet ds_2;
        private DataTable dt_2;
        private string Zeiritu;
        private DataTable dt_3;
        private DataTable dt_4;
        private DataTable dt_5;
        private DataTable dt_6;
        private string Tax = "";

        private void Form7_Load(object sender, EventArgs e)
        {
            this.Icon = global::Local_Nanki.Properties.Resources.k_01;

            dt_1 = ds_1.Tables[0];
            dt_2 = ds_2.Tables[0];
            

            for (int hh = 0; hh < dt_1.Rows.Count; hh++)
            {
                DataRow Ne_Row = dataSet6.DataTable4.NewRow();
                for (int ii = 0; ii < dt_1.Columns.Count; ii++)
                {
                    Ne_Row[ii] = dt_1.Rows[hh][ii].ToString();
                }
                dataSet6.DataTable4.Rows.Add(Ne_Row);
            }

            for (int hh = 0; hh < dt_2.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet1.DataTable3.NewRow();
                for (int ii = 0; ii < dt_2.Columns.Count; ii++)
                {
                    N_Row[ii] = dt_2.Rows[hh][ii].ToString();
                }
                dataSet1.DataTable3.Rows.Add(N_Row);

            }

            for (int hh = 0; hh < dt_3.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet13.DataTable5.NewRow();
                for (int ii = 0; ii < dt_3.Columns.Count; ii++)
                {
                    N_Row[ii] = dt_3.Rows[hh][ii].ToString();
                }
                dataSet13.DataTable5.Rows.Add(N_Row);

            }

            for (int hh = 0; hh < dt_4.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet13.DataTable51.NewRow();
                for (int ii = 0; ii < dt_4.Columns.Count; ii++)
                {
                    N_Row[ii] = dt_4.Rows[hh][ii].ToString();
                }
                dataSet13.DataTable51.Rows.Add(N_Row);

            }

            for (int hh = 0; hh < dt_5.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet13.DataTable52.NewRow();
                for (int ii = 0; ii < dt_5.Columns.Count; ii++)
                {
                    N_Row[ii] = dt_5.Rows[hh][ii].ToString();
                }
                dataSet13.DataTable52.Rows.Add(N_Row);

            }

            for (int hh = 0; hh < dt_6.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet13.DataTable81.NewRow();
                for (int ii = 0; ii < dt_6.Columns.Count; ii++)
                {
                    N_Row[ii] = dt_6.Rows[hh][ii].ToString();
                }
                dataSet13.DataTable81.Rows.Add(N_Row);

            }

            Combo_Add();

            comboBox2.Items.Add(dataSet13.DataTable5.Rows[0][1].ToString());
            comboBox2.Items.Add(dataSet13.DataTable51.Rows[0][1].ToString());
            comboBox2.Items.Add(dataSet13.DataTable52.Rows[0][1].ToString());
            comboBox2.SelectedIndex = 0;

            foreach (DataSet13.DataTable81Row abc in dataSet13.DataTable81)
            {
                if (abc[0].ToString() != "")
                {
                    comboBox3.Items.Add(abc[0].ToString());
                }
            }
            comboBox3.SelectedIndex = 0;

        }        
       
        private void button2_Click(object sender, EventArgs e)////////////////////////請求明細書印刷
        {
            //M_hh = 0;
            if (comboBox1.SelectedIndex != -1)
            {
                //printPreviewDialog1.Document = printDocument1;
                //printPreviewDialog1.Width = 1000;
                //printPreviewDialog1.Height = 700;
                //printPreviewDialog1.StartPosition = FormStartPosition.CenterScreen;
                //printPreviewDialog1.ShowDialog();

                printDocument1.Print();

                
                for (M_hh = 0; M_hh < dataSet17.DataTable2.Rows.Count; M_hh++)
                {
                    //printPreviewDialog1.Document = printDocument2;
                    //printPreviewDialog1.Width = 1000;
                    //printPreviewDialog1.Height = 700;
                    //printPreviewDialog1.StartPosition = FormStartPosition.CenterScreen;
                    //printPreviewDialog1.ShowDialog();

                    printDocument2.Print();
                }
            }
        }

        private void button1_Click(object sender, EventArgs e)////////////////////////明細書のみ印刷
        {
            if (comboBox1.SelectedIndex != -1)
            {
                for (M_hh = 0; M_hh < dataSet17.DataTable2.Rows.Count; M_hh++)
                {
                    //printPreviewDialog1.Document = printDocument2;
                    //printPreviewDialog1.Width = 1000;
                    //printPreviewDialog1.Height = 700;
                    //printPreviewDialog1.StartPosition = FormStartPosition.CenterScreen;
                    //printPreviewDialog1.ShowDialog();

                    printDocument2.Print();
                }
            }
        }

        private void button3_Click(object sender, EventArgs e)//////////////////////////閉じる
        {
            this.Close();
        }

        private void checkBox1_CheckedChanged(object sender, EventArgs e)//////////////伝票ごとに消費税
        {
            if (comboBox1.SelectedIndex != -1)
            {
                //dateTimePicker1.MaxDate = dateTimePicker2.Value;
                //dateTimePicker2.MinDate = dateTimePicker1.Value;

                dataSet17.DataTable1.Clear();
                dataSet17.DataTable2.Clear();
                string Code = comboBox1.SelectedItem.ToString().Substring(0, 6);

                Goukei = 0;
                Zei_Goukei = 0;
                All_Kei = 0;
                All_Zei = 0;

                int zz = 0;
                foreach (DataSet1.DataTable3Row abc in dataSet1.DataTable3)
                {
                    if (abc._04.ToString() == Code)
                    {
                        dataGridView1.Columns[0].Visible = true;
                        Meisai_Open(abc[0].ToString(), abc[1].ToString());
                        zz++;
                    }
                }

                if (zz == 0)
                {
                    dataGridView1.Columns[0].Visible = false;
                    Meisai_Open(Code, comboBox1.SelectedItem.ToString().Remove(0, 7));
                }
            }
        }

        private string K_Code = "";
        private string K_Name = "";
        private int Print_Pos = 0;
        private int P_Count = 0;
        private int P_Page = 0;
        private void printDocument1_PrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e)//////請求明細 表紙
        {
            int Header = 60;//////////////////////ヘッダー
            int Right = 80;///////////////////////左余白
            int Header_Gyou = 20;//////////////////ヘッダー行間
            int Pitch = 0;/////////////////////////ピッチ
            int Meisai_Width = 650;/////////////////明細幅
            int Meisai_Header = 0;//////////////////明細高さスタート位置
            int Meisai_Height = 0;//////////////////明細高さ
            int Meisai_Pitch = 14;//////////////////明細行数
            int Meisai_Gyou = 50;///////////////////明細行間

            string J_1 = "";
            string J_2 = "";
            string J_3 = "";

          

            foreach (DataSet1.DataTable3Row abc in dataSet1.DataTable3)
            {
                if (K_Code == abc[0].ToString())
                {
                    J_1 = abc[5].ToString();
                    J_2 = abc[6].ToString();
                    J_3 = abc[7].ToString();
                    break;
                }

            }

            e.Graphics.DrawString("請　求　書", new Font("ＭＳ Ｐ明朝", 22), Brushes.Black, 300, Header);

            e.Graphics.DrawString(dateTimePicker3.Value.ToString("yyyy年M月d日"), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 550, Header);


            Pitch = Header + Header_Gyou + 20;
            int R_Pitch = Pitch;
            e.Graphics.DrawString(comboBox1.SelectedItem.ToString().Remove(0,7) + "　御中", new Font("ＭＳ Ｐ明朝", 15, FontStyle.Bold), Brushes.Black, Right, Pitch);
            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch + Header_Gyou,
              Right + e.Graphics.MeasureString(comboBox1.SelectedItem.ToString().Remove(0, 7) + "　御中", new Font("ＭＳ Ｐ明朝", 15, FontStyle.Bold)).Width, Pitch + Header_Gyou);


            string JI_Yubin = "";
            string JI_1 = "";
            string JI_2 = "";
            string JI_3 = "";
            string JI_4 = "";
            string JI_5 = "";

            if (comboBox2.SelectedIndex == 0)
            {
                JI_Yubin = dataSet13.DataTable5.Rows[0][0].ToString();
                JI_1 = dataSet13.DataTable5.Rows[0][1].ToString();
                JI_2 = dataSet13.DataTable5.Rows[0][2].ToString();
                JI_3 = dataSet13.DataTable5.Rows[0][3].ToString();
                JI_4 = dataSet13.DataTable5.Rows[0][4].ToString();

            }
            else if(comboBox2.SelectedIndex == 1)
            {
                JI_Yubin = dataSet13.DataTable51.Rows[0][0].ToString();
                JI_1 = dataSet13.DataTable51.Rows[0][1].ToString();
                JI_2 = dataSet13.DataTable51.Rows[0][2].ToString();
                JI_3 = dataSet13.DataTable51.Rows[0][3].ToString();
                JI_4 = dataSet13.DataTable51.Rows[0][4].ToString();
               
            }
            else if (comboBox2.SelectedIndex == 2)
            {
                JI_Yubin = dataSet13.DataTable52.Rows[0][0].ToString();
                JI_1 = dataSet13.DataTable52.Rows[0][1].ToString();
                JI_2 = dataSet13.DataTable52.Rows[0][2].ToString();
                JI_3 = dataSet13.DataTable52.Rows[0][3].ToString();
                JI_4 = dataSet13.DataTable52.Rows[0][4].ToString();
                
            }

            JI_5 = comboBox3.SelectedItem.ToString();




            R_Pitch += 15;
            if (JI_Yubin != "")
            {
                JI_Yubin = "〒" + JI_Yubin;
            }
            e.Graphics.DrawString(JI_1, new Font("ＭＳ Ｐ明朝", 13), Brushes.Black, Right + 440, R_Pitch);
            R_Pitch += Header_Gyou + 5;

            e.Graphics.DrawString(JI_Yubin, new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 440, R_Pitch);
            R_Pitch += Header_Gyou;

            e.Graphics.DrawString(JI_2, new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 440, R_Pitch);
            R_Pitch += Header_Gyou;

            e.Graphics.DrawString(JI_3, new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 440, R_Pitch);
            R_Pitch += Header_Gyou;

            e.Graphics.DrawString(JI_4, new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 440, R_Pitch);

            Pitch += Header_Gyou + 10;
            if (J_1 != "")
            {
                J_1 = "〒" + J_1;
            }
            e.Graphics.DrawString(J_1, new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right, Pitch);
            Pitch += Header_Gyou;
            e.Graphics.DrawString(J_2, new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right, Pitch);
            Pitch += Header_Gyou;
            e.Graphics.DrawString(J_3, new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right, Pitch);


            Pitch += Header_Gyou;
            Pitch += Header_Gyou;

           
            e.Graphics.DrawString("下記の通りご請求申し上げます", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right, Pitch);

            if (dataSet17.DataTable2.Rows.Count > Meisai_Pitch - 1)
            {
                e.Graphics.DrawString("《 " + P_Page.ToString() + " Page 》", new Font("ＭＳ Ｐ明朝", 10), Brushes.Black, Right + 590, Pitch + 5);
            }

            Pitch += Header_Gyou + 5;
            Meisai_Header = Pitch;

            e.Graphics.FillRectangle(new SolidBrush(Color.Silver), Right, Pitch, Meisai_Width, Meisai_Gyou);

            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);

            e.Graphics.DrawString("取　引　内　容", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 40, Pitch + 17);
            e.Graphics.DrawString("金　額", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 220, Pitch + 17);
            if (Tax == "税抜")
            {
                e.Graphics.DrawString("消費税", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 330, Pitch + 17);
            }
            else
            {
                e.Graphics.DrawString("内消費税", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 320, Pitch + 17);
            }
            e.Graphics.DrawString("合　計", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 460, Pitch + 17);
            e.Graphics.DrawString("備　考", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 570, Pitch + 17);
            



            Pitch += Meisai_Gyou;
            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);
            Meisai_Height += Meisai_Gyou;

            for (int hh = 0; hh < Meisai_Pitch; hh++)
            {
                Pitch += Meisai_Gyou;
                e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);
                Meisai_Height += Meisai_Gyou;
            }

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 180, Pitch - 32, Right + 540, Pitch - 32);



            e.Graphics.DrawLine(new Pen(Color.Black), Right, Meisai_Header, Right, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 180, Meisai_Header, Right + 180, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 300, Meisai_Header, Right + 300, Meisai_Header + Meisai_Height);
        
            e.Graphics.DrawLine(new Pen(Color.Black), Right + 420, Meisai_Header, Right + 420, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 540, Meisai_Header, Right + 540, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + Meisai_Width, Meisai_Header, Right + Meisai_Width, Meisai_Header + Meisai_Height);

            e.Graphics.FillRectangle(new SolidBrush(Color.Silver), Right + 1, Pitch - Meisai_Gyou + 1, 179, 48);

            e.Graphics.DrawString("合 計 金 額", new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 40, Pitch - 32);

            e.Graphics.DrawString("金　額", new Font("ＭＳ Ｐ明朝", 10), Brushes.Black, Right + 220, Pitch - 47);

            if (Tax == "税抜")
            {
                e.Graphics.DrawString("消費税", new Font("ＭＳ Ｐ明朝", 10), Brushes.Black, Right + 335, Pitch - 47);
            }
            else
            {
                e.Graphics.DrawString("内消費税", new Font("ＭＳ Ｐ明朝", 10), Brushes.Black, Right + 325, Pitch - 47);

            }

            e.Graphics.DrawString("総合計", new Font("ＭＳ Ｐ明朝", 10), Brushes.Black, Right + 460, Pitch - 47);


            e.Graphics.DrawString(JI_5, new Font("ＭＳ Ｐゴシック", 12, FontStyle.Bold), Brushes.Black, Right + 40, Pitch + 27);


            Pitch = Meisai_Header + Meisai_Gyou + 7;

            if (dataSet17.DataTable2.Rows.Count == 1)
            {
                e.Graphics.DrawString("別紙明細の通り", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 35, Pitch + 12);

                e.Graphics.DrawString(dataSet17.DataTable2.Rows[0][2].ToString(), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                    (Right + 290) - e.Graphics.MeasureString(dataSet17.DataTable2.Rows[0][2].ToString(), new Font("ＭＳ Ｐ明朝", 14)).Width, Pitch + 10);

                e.Graphics.DrawString(dataSet17.DataTable2.Rows[0][3].ToString(), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                     (Right + 410) - e.Graphics.MeasureString(dataSet17.DataTable2.Rows[0][3].ToString(), new Font("ＭＳ Ｐ明朝", 14)).Width, Pitch + 10);

                e.Graphics.DrawString(dataSet17.DataTable2.Rows[0][4].ToString(), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                    (Right + 530) - e.Graphics.MeasureString(dataSet17.DataTable2.Rows[0][4].ToString(), new Font("ＭＳ Ｐ明朝", 14)).Width, Pitch + 10);


                for (int hh = 0; hh < Meisai_Pitch - 1; hh++)
                {
                    Pitch += Meisai_Gyou;
                }


                e.Graphics.DrawString(dataSet17.DataTable2.Rows[0][2].ToString(), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                    (Right + 290) - e.Graphics.MeasureString(dataSet17.DataTable2.Rows[0][2].ToString(), new Font("ＭＳ Ｐ明朝", 14)).Width, Pitch + 18);

                e.Graphics.DrawString(dataSet17.DataTable2.Rows[0][3].ToString(), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                     (Right + 410) - e.Graphics.MeasureString(dataSet17.DataTable2.Rows[0][3].ToString(), new Font("ＭＳ Ｐ明朝", 14)).Width, Pitch + 18);

                e.Graphics.DrawString(dataSet17.DataTable2.Rows[0][4].ToString(), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                    (Right + 530) - e.Graphics.MeasureString(dataSet17.DataTable2.Rows[0][4].ToString(), new Font("ＭＳ Ｐ明朝", 14)).Width, Pitch + 18);


            }
            else if (dataSet17.DataTable2.Rows.Count > 1)
            {
                int K_Total = 0;
                int Z_Total = 0;
                int All = 0;

                int Total_Pitch = Pitch;
                for (int hh = 0; hh < Meisai_Pitch - 1; hh++)
                {
                    Total_Pitch += Meisai_Gyou;
                }
                
                foreach (DataSet17.DataTable2Row abc in dataSet17.DataTable2)
                {
                    K_Total += int.Parse(abc[2].ToString().Replace(",", ""));
                    Z_Total += int.Parse(abc[3].ToString().Replace(",", ""));
                    All += int.Parse(abc[4].ToString().Replace(",", ""));
                }

                for (int hh = Print_Pos; hh < dataSet17.DataTable2.Rows.Count; hh++)
                {
                    e.Graphics.DrawString(dataSet17.DataTable2.Rows[hh][1].ToString() + "様", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 20, Pitch + 3);

                    e.Graphics.DrawString("別紙明細の通り", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 20, Pitch + 22);

                    e.Graphics.DrawString(dataSet17.DataTable2.Rows[hh][2].ToString(), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                        (Right + 290) - e.Graphics.MeasureString(dataSet17.DataTable2.Rows[hh][2].ToString(), new Font("ＭＳ Ｐ明朝", 14)).Width, Pitch + 10);

                    e.Graphics.DrawString(dataSet17.DataTable2.Rows[hh][3].ToString(), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                         (Right + 410) - e.Graphics.MeasureString(dataSet17.DataTable2.Rows[hh][3].ToString(), new Font("ＭＳ Ｐ明朝", 14)).Width, Pitch + 10);

                    e.Graphics.DrawString(dataSet17.DataTable2.Rows[hh][4].ToString(), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                        (Right + 530) - e.Graphics.MeasureString(dataSet17.DataTable2.Rows[hh][4].ToString(), new Font("ＭＳ Ｐ明朝", 14)).Width, Pitch + 10);


                    Print_Pos++;
                    P_Count++;
                    Pitch += Meisai_Gyou;

                   

                    if (P_Count == Meisai_Pitch - 1)
                    {
                        break;
                    }
                    if (Print_Pos == (dataSet17.DataTable2.Rows.Count))
                    {
                        break;
                    }
                }


               

                e.Graphics.DrawString(K_Total.ToString("n0"), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                   (Right + 290) - e.Graphics.MeasureString(K_Total.ToString("n0"), new Font("ＭＳ Ｐ明朝", 14)).Width, Total_Pitch + 18);

                e.Graphics.DrawString(Z_Total.ToString("n0"), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                     (Right + 410) - e.Graphics.MeasureString(Z_Total.ToString("n0"), new Font("ＭＳ Ｐ明朝", 14)).Width, Total_Pitch + 18);

               
               // if (Tax == "税抜")
               // {
               //     All = K_Total + Z_Total;
               // }
               // else
               // {
               //     All = K_Total;
               // }

                e.Graphics.DrawString(All.ToString("n0"), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black,
                    (Right + 530) - e.Graphics.MeasureString(All.ToString("n0"), new Font("ＭＳ Ｐ明朝", 14)).Width, Total_Pitch + 18);


                

                if (P_Count == Meisai_Pitch - 1)
                {
                    e.HasMorePages = true;
                    P_Page++;
                    P_Count = 0;
                }
                if (Print_Pos == (dataSet17.DataTable2.Rows.Count))
                {
                    e.HasMorePages = false;
                }


            }



        }
       
        private void printDocument1_BeginPrint(object sender, System.Drawing.Printing.PrintEventArgs e)
        {
            Print_Pos = 0;
            P_Count = 0;
            P_Page = 1;
        }

        private int M_hh = 0;
        private int M_Count = 0;
        private int M_Pos = 0;
        private int M_Page = 0;
        private void printDocument2_PrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e)//////請求明細 明細
        {
            int Header = 60;//////////////////////ヘッダー
            int Right = 60;///////////////////////左余白
            int Header_Gyou = 20;//////////////////ヘッダー行間
            int Pitch = 0;/////////////////////////ピッチ
            int Meisai_Width = 680;/////////////////明細幅
            int Meisai_Header = 0;//////////////////明細高さスタート位置
            //int Meisai_Height = 0;//////////////////明細高さ
            int Meisai_Pitch = 54;//////////////////明細行数《偶数》
            int Meisai_Gyou = 18;///////////////////明細行間


            e.Graphics.DrawString("明　細　書", new Font("ＭＳ Ｐ明朝", 18), Brushes.Black, 300, Header);

            e.Graphics.DrawString(dateTimePicker3.Value.ToString("yyyy年M月d日"), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 550, Header + 5);

            e.Graphics.DrawString("【 "+dataSet17.DataTable2.Rows[M_hh][1].ToString() + " 様 】", new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right, Header + Header_Gyou);


            e.Graphics.DrawString("【 " + dateTimePicker1.Value.ToString("yyyy年MM月dd日") + " から " + dateTimePicker2.Value.ToString("yyyy年MM月dd日") + " まで 】",
                new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right, Header + Header_Gyou + Header_Gyou);


            e.Graphics.DrawString("《 " + M_Page.ToString() + " Page 》", new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 620, Header + Header_Gyou + Header_Gyou);

            Pitch = Header + Header_Gyou + Header_Gyou + Header_Gyou;
            Meisai_Header = Pitch;

            e.Graphics.FillRectangle(new SolidBrush(Color.LightGray), Right, Pitch, Meisai_Width, Meisai_Gyou);

            Pitch += Meisai_Gyou;

            for (int hh = 0; hh < Meisai_Pitch / 2; hh++)
            {
                e.Graphics.FillRectangle(new SolidBrush(Color.White), Right, Pitch, Meisai_Width, Meisai_Gyou);

                Pitch += Meisai_Gyou;

                e.Graphics.FillRectangle(new SolidBrush(Color.WhiteSmoke), Right, Pitch, Meisai_Width, Meisai_Gyou);

                Pitch += Meisai_Gyou;
            }

            Pitch = Meisai_Header;

            e.Graphics.DrawString("納品日", new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 15, Pitch + 3);
            e.Graphics.DrawString("伝票No", new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 80, Pitch + 3);
            e.Graphics.DrawString("商品名", new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 180, Pitch + 3);
            e.Graphics.DrawString("規格", new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 325, Pitch + 3);
            e.Graphics.DrawString("数量", new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 365, Pitch + 3);
            e.Graphics.DrawString("単位", new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 400, Pitch + 3);
            e.Graphics.DrawString("単価", new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 450, Pitch + 3);
            e.Graphics.DrawString("金額", new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 515, Pitch + 3);
            e.Graphics.DrawString("伝票合計", new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 550, Pitch + 3);
            e.Graphics.DrawString("備考", new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 620, Pitch + 3);

            e.Graphics.DrawRectangle(new Pen(Color.Black), Right, Pitch, Meisai_Width, Meisai_Gyou);

            Pitch += Meisai_Gyou;

            for (int hh = M_Count; hh < dataSet17.DataTable1.Rows.Count; hh++)
            {
                if (dataSet17.DataTable2.Rows[M_hh][0].ToString() == dataSet17.DataTable1.Rows[hh][12].ToString())
                {
                    if (dataSet17.DataTable1.Rows[hh][2].ToString() != "")
                    {
                        DateTime dt;
                        if (DateTime.TryParse(dataSet17.DataTable1.Rows[hh][1].ToString(), out dt) == true)
                        {
                            e.Graphics.DrawString(dt.ToString("yyyy/MM/dd"), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right, Pitch + 3);
                        }
                        else
                        {
                            e.Graphics.DrawString(dataSet17.DataTable1.Rows[hh][1].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right, Pitch + 3);
                        }
                    }
                    e.Graphics.DrawString(dataSet17.DataTable1.Rows[hh][2].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 80, Pitch + 3);
                    e.Graphics.DrawString(dataSet17.DataTable1.Rows[hh][3].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 135, Pitch + 3);
                    e.Graphics.DrawString(dataSet17.DataTable1.Rows[hh][4].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 180, Pitch + 3);
                    e.Graphics.DrawString(dataSet17.DataTable1.Rows[hh][5].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 330, Pitch + 3);

                    e.Graphics.DrawString(dataSet17.DataTable1.Rows[hh][6].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black,
                        (Right + 385) - e.Graphics.MeasureString(dataSet17.DataTable1.Rows[hh][6].ToString(), new Font("ＭＳ Ｐ明朝", 9)).Width, Pitch + 3);

                    e.Graphics.DrawString(dataSet17.DataTable1.Rows[hh][7].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 410, Pitch + 3);

                    e.Graphics.DrawString(dataSet17.DataTable1.Rows[hh][8].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black,
                        (Right + 480) - e.Graphics.MeasureString(dataSet17.DataTable1.Rows[hh][8].ToString(), new Font("ＭＳ Ｐ明朝", 9)).Width, Pitch + 3);

                    e.Graphics.DrawString(dataSet17.DataTable1.Rows[hh][9].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black,
                        (Right + 540) - e.Graphics.MeasureString(dataSet17.DataTable1.Rows[hh][9].ToString(), new Font("ＭＳ Ｐ明朝", 9)).Width, Pitch + 3);

                    e.Graphics.DrawString(dataSet17.DataTable1.Rows[hh][10].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black,
                        (Right + 600) - e.Graphics.MeasureString(dataSet17.DataTable1.Rows[hh][10].ToString(), new Font("ＭＳ Ｐ明朝", 9)).Width, Pitch + 3);

                    e.Graphics.DrawString(dataSet17.DataTable1.Rows[hh][11].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 620, Pitch + 3);

                    Pitch += Meisai_Gyou;
                    M_Pos++;
                  

                    if (M_Pos == Meisai_Pitch)
                    {
                        M_Count++;
                        break;
                    }

                    if (M_Count == dataSet17.DataTable1.Rows.Count)
                    {
                        break;
                    }
                }
                M_Count++;
            }

            if (M_Pos == Meisai_Pitch)
            {
                M_Pos = 0;
                M_Page++;
                e.HasMorePages = true;
            }

            if (M_Count == dataSet17.DataTable1.Rows.Count)
            {
                e.HasMorePages = false;
            }

        }

        private void printDocument2_BeginPrint(object sender, System.Drawing.Printing.PrintEventArgs e)
        {
            M_Pos = 0;
            M_Count = 0;
            M_Page = 1;
        }      

        private void comboBox1_SelectedIndexChanged(object sender, EventArgs e)
        {
            dataSet17.DataTable1.Clear();
            dataSet17.DataTable2.Clear();
            string Code = comboBox1.SelectedItem.ToString().Substring(0, 6);

            Goukei = 0;
            Zei_Goukei = 0;
            All_Kei = 0;
            All_Zei = 0;

            int zz = 0;
            foreach (DataSet1.DataTable3Row abc in dataSet1.DataTable3)
            {
                if (abc._04.ToString() == Code)
                {
                    dataGridView1.Columns[0].Visible = true;
                    Meisai_Open(abc[0].ToString(), abc[1].ToString());
                    zz++;
                }
            }

            if (zz == 0)
            {
                dataGridView1.Columns[0].Visible = false;
                Meisai_Open(Code, comboBox1.SelectedItem.ToString().Remove(0, 7));
            }

        }

        private void dateTimePicker1_ValueChanged(object sender, EventArgs e)
        {
            if (comboBox1.SelectedIndex != -1)
            {
                dateTimePicker1.MaxDate = dateTimePicker2.Value;
                dateTimePicker2.MinDate = dateTimePicker1.Value;

                dataSet17.DataTable1.Clear();
                dataSet17.DataTable2.Clear();
                string Code = comboBox1.SelectedItem.ToString().Substring(0, 6);

                Goukei = 0;
                Zei_Goukei = 0;
                All_Kei = 0;
                All_Zei = 0;

                int zz = 0;
                foreach (DataSet1.DataTable3Row abc in dataSet1.DataTable3)
                {
                    if (abc._04.ToString() == Code)
                    {
                        dataGridView1.Columns[0].Visible = true;
                        Meisai_Open(abc[0].ToString(), abc[1].ToString());
                        zz++;
                    }
                }

                if (zz == 0)
                {
                    dataGridView1.Columns[0].Visible = false;
                    Meisai_Open(Code, comboBox1.SelectedItem.ToString().Remove(0, 7));
                }
            }
        }

        private void dateTimePicker2_ValueChanged(object sender, EventArgs e)
        {
            if (comboBox1.SelectedIndex != -1)
            {
                dateTimePicker1.MaxDate = dateTimePicker2.Value;
                dateTimePicker2.MinDate = dateTimePicker1.Value;



                dataSet17.DataTable1.Clear();
                dataSet17.DataTable2.Clear();
                string Code = comboBox1.SelectedItem.ToString().Substring(0, 6);

                Goukei = 0;
                Zei_Goukei = 0;
                All_Kei = 0;
                All_Zei = 0;

                int zz = 0;
                foreach (DataSet1.DataTable3Row abc in dataSet1.DataTable3)
                {
                    if (abc._04.ToString() == Code)
                    {
                        dataGridView1.Columns[0].Visible = true;
                        Meisai_Open(abc[0].ToString(), abc[1].ToString());
                        zz++;
                    }
                }

                if (zz == 0)
                {
                    dataGridView1.Columns[0].Visible = false;
                    Meisai_Open(Code, comboBox1.SelectedItem.ToString().Remove(0, 7));
                }
            }
        }


        private void Combo_Add()
        {
            foreach (DataSet1.DataTable3Row abc in dataSet1.DataTable3)
            {
                comboBox1.Items.Add(abc[0].ToString() + "　" + abc[1].ToString());
            }

            //comboBox1.SelectedIndex = 0;
        }

        private int Goukei = 0;
        private int Zei_Goukei = 0;
        private int All_Kei = 0;
        private int All_Zei = 0;

        private void Meisai_Open(string Code,string User)
        {
            if (comboBox1.SelectedIndex != -1)
            {
                Goukei = 0;
                Zei_Goukei = 0;

                K_Code = Code;
                K_Name = User;

                
                foreach (DataSet1.DataTable3Row abc in dataSet1.DataTable3)
                {
                    if (Code == abc[0].ToString())
                    {
                        Tax = abc._03.ToString();
                    }
                }

                label3.Text = Tax;
                label3.Visible = true;

                DateTime dt_1 = dateTimePicker1.Value;
                DateTime dt_2 = dateTimePicker2.Value;
                string s_dt_1 = dt_1.ToString().Substring(0, 10);
                string s_dt_2 = dt_2.ToString().Substring(0, 10);
                dt_1 = DateTime.Parse(s_dt_1);
                dt_2 = DateTime.Parse(s_dt_2);



                int zz = 0;
                int Total = 0;
                int Zei = 0;

                foreach (DataSet6.DataTable4Row abc in dataSet6.DataTable4)
                {
                    DateTime N_dt;
                    if (DateTime.TryParse(abc.納品日.ToString(), out N_dt) == true)
                    {
                        if (Code == abc.顧客コード.ToString() &&
                            dt_1 <= N_dt && N_dt <= dt_2)
                        {
                            if (abc._受注No_.ToString().Contains("-") == true)
                            {
                                if (abc.商品コード != "")
                                {
                                    DataRow N_Row = dataSet17.DataTable1.NewRow();

                                    if (zz == 0)
                                    {
                                        N_Row[0] = User;
                                        N_Row[1] = abc.納品日.ToString();
                                        N_Row[2] = abc._受注No_.ToString().Substring(0, 6);
                                    }
                                    else
                                    {
                                        N_Row[0] = "";
                                        N_Row[1] = abc.納品日.ToString();
                                        N_Row[2] = "";
                                    }
                                    N_Row[3] = abc.商品コード.ToString();
                                    N_Row[4] = abc.商品名.ToString();
                                    N_Row[5] = abc.規格.ToString();
                                    N_Row[6] = abc.数量.ToString();
                                    N_Row[7] = abc.単位.ToString();
                                    int Tanka;
                                    if (int.TryParse(abc.売単価.ToString(), out Tanka) == true)
                                    {
                                        N_Row[8] = Tanka.ToString("n0");
                                    }
                                    else
                                    {
                                        N_Row[8] = abc.売単価.ToString();
                                    }

                                    int Kingaku = 0;
                                    if (int.TryParse(abc.金額.ToString().Replace(",", ""), out Kingaku) == true)
                                    {
                                        Total += Kingaku;
                                    }

                                    N_Row[9] = abc.金額.ToString();
                                    N_Row[10] = "";
                                    N_Row[11] = "";
                                    N_Row[12] = Code;
                                    dataSet17.DataTable1.Rows.Add(N_Row);
                                    zz++;
                                }
                                else
                                {

                                    if (Tax == "税抜")
                                    {
                                        DataRow N_Row = dataSet17.DataTable1.NewRow();

                                        if (zz == 0)
                                        {
                                            N_Row[0] = User;
                                            N_Row[1] = abc.納品日.ToString();
                                            N_Row[2] = abc._受注No_.ToString().Substring(0, 6);
                                        }
                                        else
                                        {
                                            N_Row[0] = "";
                                            N_Row[1] = abc.納品日.ToString();
                                            N_Row[2] = "";
                                        }
                                        N_Row[3] = "";
                                        N_Row[4] = "消　費　税";
                                        N_Row[5] = "";
                                        N_Row[6] = "";
                                        N_Row[7] = "";
                                        N_Row[8] = "";

                                        Goukei += Total;

                                        int TT = Total * int.Parse(Zeiritu);
                                        double Tax = (double)TT / (double)100;
                                        double IntTax = Math.Ceiling(Tax);

                                        Zei = (int)IntTax;
                                        //Zei_Goukei += Zei;


                                        N_Row[9] = Zei.ToString("n0");
                                        N_Row[10] = "";
                                        N_Row[11] = "";
                                        N_Row[12] = Code;

                                        if (checkBox1.Checked == true)
                                        {
                                            dataSet17.DataTable1.Rows.Add(N_Row);
                                        }

                                    }
                                    else
                                    {
                                        DataRow N_Row = dataSet17.DataTable1.NewRow();

                                        if (zz == 0)
                                        {
                                            N_Row[0] = User;
                                            N_Row[1] = abc.納品日.ToString();
                                            N_Row[2] = abc._受注No_.ToString().Substring(0, 6);
                                        }
                                        else
                                        {
                                            N_Row[0] = "";
                                            N_Row[1] = abc.納品日.ToString();
                                            N_Row[2] = "";
                                        }
                                        N_Row[3] = "";
                                        N_Row[4] = "内　消　費　税";
                                        N_Row[5] = "";
                                        N_Row[6] = "";
                                        N_Row[7] = "";
                                        N_Row[8] = "";
                                        Goukei += Total;
                                        double D_Zei = (double)Total / (double)(100 + int.Parse(Zeiritu));
                                        D_Zei = (double)D_Zei * (double)int.Parse(Zeiritu);
                                        Zei = (int)D_Zei;
                                        //Zei_Goukei += Zei;
                                        N_Row[9] = Zei.ToString("n0");
                                        N_Row[10] = "";
                                        N_Row[11] = "";
                                        N_Row[12] = Code;

                                        if (checkBox1.Checked == true)
                                        {
                                            dataSet17.DataTable1.Rows.Add(N_Row);
                                        }

                                    }


                                    DataRow Ne_Row = dataSet17.DataTable1.NewRow();
                                    Ne_Row[0] = "";
                                    Ne_Row[1] = abc.納品日.ToString();
                                    Ne_Row[2] = "";
                                    Ne_Row[3] = "";
                                    Ne_Row[4] = "【 伝 票 計 】";
                                    Ne_Row[5] = "";
                                    Ne_Row[6] = "";
                                    Ne_Row[7] = "";
                                    Ne_Row[8] = "";
                                    Ne_Row[9] = "";
                                    if (Tax == "税抜")
                                    {
                                        int All_Total = Total;

                                        if (checkBox1.Checked == true)
                                        {
                                            All_Total = Total + Zei;
                                        }

                                        Ne_Row[10] = All_Total.ToString("n0");
                                    }
                                    else
                                    {
                                        Ne_Row[10] = Total.ToString("n0");
                                    }
                                    Ne_Row[11] = "";
                                    Ne_Row[12] = Code;

                                    dataSet17.DataTable1.Rows.Add(Ne_Row);

                                    DataRow New_Row = dataSet17.DataTable1.NewRow();
                                    New_Row[0] = "";
                                    New_Row[1] = abc.納品日.ToString();
                                    New_Row[2] = "";
                                    New_Row[3] = "";
                                    New_Row[4] = "";
                                    New_Row[5] = "";
                                    New_Row[6] = "";
                                    New_Row[7] = "";
                                    New_Row[8] = "";
                                    New_Row[9] = "";
                                    New_Row[10] = "";
                                    New_Row[11] = "";
                                    New_Row[12] = Code;
                                    dataSet17.DataTable1.Rows.Add(New_Row);


                                    zz = 0;
                                    Total = 0;
                                    Zei = 0;
                                }



                            }
                        }
                    }


                }


                DataTable sort_table = dataSet17.DataTable1.Clone();
                DataView dv = new DataView(dataSet17.DataTable1);
                dv.Sort = "納品日";
                foreach (DataRowView abc in dv)
                {
                    sort_table.ImportRow(abc.Row);
                }

                dataSet17.DataTable1.Clear();
                for (int hh = 0; hh < sort_table.Rows.Count; hh++)
                {
                    DataRow N_Row = dataSet17.DataTable1.NewRow();
                    for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                    {
                        N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                    }
                    dataSet17.DataTable1.Rows.Add(N_Row);
                }
                

               


                if (Tax == "税抜")
                {
                    All_Kei += Goukei;
                    label4.Text = @"金額計　\" + All_Kei.ToString("n0");
                    All_Zei = All_Kei * int.Parse(Zeiritu) / 100;
                    Zei_Goukei = Goukei* int.Parse(Zeiritu) / 100;
                    label5.Text = @"消費税　\" +All_Zei.ToString("n0");
                    int All = All_Kei + All_Zei;
                    label6.Text = @"合　計　\" + All.ToString("n0");
                    label4.Visible = true;
                    label5.Visible = true;
                    label6.Visible = true;

                    DataRow N_row = dataSet17.DataTable2.NewRow();
                    N_row[0] = Code;
                    N_row[1] = User;
                    N_row[2]= Goukei.ToString("n0");
                    N_row[3]= Zei_Goukei.ToString("n0");
                    int Kei = Goukei + Zei_Goukei;
                    N_row[4]= Kei.ToString("n0");
                    dataSet17.DataTable2.Rows.Add(N_row);

                }
                else
                {
                    All_Kei += Goukei;
                    label4.Text = @"金額計　\" + All_Kei.ToString("n0");
                    double G_Zei = (double)All_Kei / (double)(100 + int.Parse(Zeiritu));
                    G_Zei = (double)G_Zei * (double)int.Parse(Zeiritu);
                    Zei_Goukei = (int)G_Zei;
                    label5.Text = @"内消費税　\" + Zei_Goukei.ToString("n0");

                    label4.Visible = true;
                    label5.Visible = true;
                    label6.Visible = false;

                    DataRow N_row = dataSet17.DataTable2.NewRow();
                    N_row[0] = Code;
                    N_row[1] = User;
                    N_row[2] = Goukei.ToString("n0");

                    double GG_Zei = (double)Goukei / (double)(100 + int.Parse(Zeiritu));
                    GG_Zei = (double)GG_Zei * (double)int.Parse(Zeiritu);
                    int ZZ_kei = (int)GG_Zei;
                    N_row[3] = ZZ_kei.ToString("n0");

                    N_row[4] = Goukei.ToString("n0");
                    dataSet17.DataTable2.Rows.Add(N_row);
                }

            }

        }

       
    }
}
