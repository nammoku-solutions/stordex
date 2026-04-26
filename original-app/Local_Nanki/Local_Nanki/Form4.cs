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
    public partial class Form4 : Form
    {
        public Form4(DataSet d1,DataSet d2)
        {
            InitializeComponent();
            ds_1 = d1;
            ds_2 = d2;
        }

        private void Form4_Load(object sender, EventArgs e)
        {
            this.Icon = global::Local_Nanki.Properties.Resources.k_01;
            dt_1 = ds_1.Tables[0];
            dt_2 = ds_2.Tables[0];

            for (int hh = 0; hh < dt_1.Rows.Count; hh++)
            {
                DataRow Ne_Row = dataSet12.DataTable_Order.NewRow();
                for (int ii = 0; ii < dt_1.Columns.Count; ii++)
                {
                    Ne_Row[ii] = dt_1.Rows[hh][ii].ToString();
                }
                dataSet12.DataTable_Order.Rows.Add(Ne_Row);
            }

            for (int hh = 0; hh < dt_2.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet12.DataTable_Item.NewRow();
                for (int ii = 0; ii < dt_2.Columns.Count; ii++)
                {
                    N_Row[ii] = dt_2.Rows[hh][ii].ToString();
                }
                dataSet12.DataTable_Item.Rows.Add(N_Row);
            }

           

            
            Item_Title();
            
            Item_Shukei_Su();           

            dataGridView1.Columns[1].Frozen = true;
            foreach (DataGridViewColumn c in dataGridView1.Columns)
            {
                c.SortMode = DataGridViewColumnSortMode.NotSortable;
            }

        }

        private DataSet ds_1;
        private DataTable dt_1;
        private DataSet ds_2;
        private DataTable dt_2;       

        private void button1_Click(object sender, EventArgs e)////////////////////////閉じる
        {
            this.Close();
        }

        private void button2_Click(object sender, EventArgs e)////////////////////////前月
        {
            DateTime dt = DateTime.Parse(label1.Text);
            dt = dt.AddMonths(-1);
            label1.Text = dt.ToString("yyyy年M月");

            if (radioButton1.Checked == true)
            {
                Item_Shukei_Su();
            }
            else if (radioButton2.Checked == true)
            {
                Item_Shukei_Uri();
            }
            else if (radioButton3.Checked == true)
            {
                Item_Shukei_Ara();
            }
        }

        private void button3_Click(object sender, EventArgs e)/////////////////////////翌月
        {
            DateTime dt = DateTime.Parse(label1.Text);
            dt = dt.AddMonths(1);
            label1.Text = dt.ToString("yyyy年M月");

            if (radioButton1.Checked == true)
            {
                Item_Shukei_Su();
            }
            else if (radioButton2.Checked == true)
            {
                Item_Shukei_Uri();
            }
            else if (radioButton3.Checked == true)
            {
                Item_Shukei_Ara();
            }
        }

        private void button4_Click(object sender, EventArgs e)//////////////////////////印刷
        {
            //printPreviewDialog1.Document = printDocument1;
            //printPreviewDialog1.Width = 1000;
            //printPreviewDialog1.Height = 700;
            //printPreviewDialog1.StartPosition = FormStartPosition.CenterScreen;
            //printPreviewDialog1.ShowDialog();

            printDocument1.Print();


        }

        private int M_Page = 0;
        private int P_Count = 0;
        private int P_Pos = 0;
        private void printDocument1_PrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e)
        {
            DateTime DT_t = dateTimePicker3.Value;
            int Pos = 0;
            int Total = 0;

            for (int hh = 0; hh < dataGridView1.Columns.Count; hh++)
            {
                if (DT_t.Day.ToString() + "(" + DT_t.ToString("ddd") + ")" == dataGridView1.Columns[hh].HeaderCell.Value.ToString())
                {
                    Pos = hh;                    
                }
                if (dataGridView1.Columns[hh].HeaderCell.Value.ToString() == "合 計")
                {
                    Total = hh;
                }
            }

            int Header = 60;//////////////////////ヘッダー
            int Right = 60;///////////////////////左余白
            int Header_Gyou = 20;//////////////////ヘッダー行間
            int Pitch = 0;/////////////////////////ピッチ
            int Meisai_Width = 680;/////////////////明細幅
            int Meisai_Header = 0;//////////////////明細高さスタート位置
            //int Meisai_Height = 0;//////////////////明細高さ
            int Meisai_Pitch = 54;//////////////////明細行数《偶数》
            int Meisai_Gyou = 18;///////////////////明細行間


            e.Graphics.DrawString("商品別集計表", new Font("ＭＳ Ｐゴシック", 16), Brushes.Black, 300, Header);

            DateTime dt = DateTime.Now;
            e.Graphics.DrawString(dt.ToString("yyyy年M月d日"), new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right + 550, Header + 5);

            e.Graphics.DrawString("【 " + dateTimePicker3.Value.ToString("M月d日") + " 受注分 】",
                new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right, Header + Header_Gyou + Header_Gyou);

            e.Graphics.DrawString("《 " + M_Page.ToString() + " Page 》", new Font("ＭＳ Ｐゴシック", 9), Brushes.Black, Right + 620, Header + Header_Gyou + Header_Gyou);

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

            e.Graphics.DrawString("コード", new Font("ＭＳ Ｐゴシック", 9), Brushes.Black, Right + 15, Pitch + 3);
            e.Graphics.DrawString("商品名", new Font("ＭＳ Ｐゴシック", 9), Brushes.Black, Right + 80, Pitch + 3);
            e.Graphics.DrawString("受注数", new Font("ＭＳ Ｐゴシック", 9), Brushes.Black, Right + 230, Pitch + 3);
            e.Graphics.DrawString("合計受注数", new Font("ＭＳ Ｐゴシック", 9), Brushes.Black, Right + 310, Pitch + 3);
           
            e.Graphics.DrawRectangle(new Pen(Color.Black), Right, Pitch, Meisai_Width, Meisai_Gyou);

            Pitch += Meisai_Gyou;


            for (int hh = P_Count; hh < dataGridView1.Rows.Count; hh++)
            {
                if (dataGridView1.Rows[hh].Cells[Total].Value.ToString() != "")
                {
                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[0].Value.ToString(), new Font("ＭＳ Ｐゴシック", 9), Brushes.Black, Right + 10, Pitch + 3);

                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[1].Value.ToString(), new Font("ＭＳ Ｐゴシック", 9), Brushes.Black, Right + 60, Pitch + 3);

                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[Pos].Value.ToString(), new Font("ＭＳ Ｐゴシック", 9), Brushes.Black,
                        (Right + 260) - e.Graphics.MeasureString(dataGridView1.Rows[hh].Cells[Pos].Value.ToString(), new Font("ＭＳ Ｐゴシック", 9)).Width, Pitch + 3);

                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[Total].Value.ToString(), new Font("ＭＳ Ｐゴシック", 9), Brushes.Black,
                        (Right + 350) - e.Graphics.MeasureString(dataGridView1.Rows[hh].Cells[Total].Value.ToString(), new Font("ＭＳ Ｐゴシック", 9)).Width, Pitch + 3);


                    Pitch += Meisai_Gyou;
                    P_Pos++;
                }

                P_Count++;

                if (P_Pos == Meisai_Pitch)
                {
                    break;
                }

                if (P_Count == dataGridView1.Rows.Count)
                {
                    break;
                }


            }

            if (P_Pos == Meisai_Pitch)
            {
                P_Pos = 0;
                M_Page++;
                e.HasMorePages = true;
            }

            if (P_Count == dataGridView1.Rows.Count)
            {
                e.HasMorePages = false;
            }

        }

        private void printDocument1_BeginPrint(object sender, System.Drawing.Printing.PrintEventArgs e)
        {
            M_Page = 1;
            P_Count = 0;
            P_Pos = 0;
        }

        private void radioButton1_CheckedChanged(object sender, EventArgs e)
        {
            Item_Shukei_Su();
        }

        private void radioButton2_CheckedChanged(object sender, EventArgs e)
        {
            Item_Shukei_Uri();
        }

        private void radioButton3_CheckedChanged(object sender, EventArgs e)
        {
            Item_Shukei_Ara();
        }

        private void dateTimePicker1_ValueChanged(object sender, EventArgs e)
        {
            if (radioButton1.Checked == true)
            {
                Item_Shukei_Su();
            }
            else if (radioButton2.Checked == true)
            {
                Item_Shukei_Uri();
            }
            else if (radioButton3.Checked == true)
            {
                Item_Shukei_Ara();
            }
        }

        private void dateTimePicker2_ValueChanged(object sender, EventArgs e)
        {
            if (radioButton1.Checked == true)
            {
                Item_Shukei_Su();
            }
            else if (radioButton2.Checked == true)
            {
                Item_Shukei_Uri();
            }
            else if (radioButton3.Checked == true)
            {
                Item_Shukei_Ara();
            }
        }


        private void Item_Title()
        {
            DateTime dt = DateTime.Now;
            label1.Text = dt.ToString("yyyy年M月");

        }

        private void Item_Shukei_Su()
        {
             dataGridView1.Columns.Clear();


             DataTable dt = new DataTable();

             DateTime d_time = DateTime.Parse(label1.Text);
             DateTime F_date = new DateTime(d_time.Year, d_time.Month, 1);


             dt.Columns.Add("商品コード", typeof(string));/////////////////////////////////////ヘッダー
             dt.Columns.Add("商品名", typeof(string));
             while (d_time.Month == F_date.Month)
             {
                 dt.Columns.Add(F_date.ToString(), typeof(string));
                 F_date = F_date.AddDays(1);
             }
             dt.Columns.Add("合 計", typeof(string));

             foreach (DataSet12.DataTable_ItemRow abc in dataSet12.DataTable_Item)///////////////ロウヘッダー
             {
                 DataRow N_Row = dt.NewRow();
                 for (int hh = 0; hh < dt.Columns.Count; hh++)
                 {
                     if (hh == 0)
                     {
                         N_Row[hh] = abc.商品コード.ToString();
                     }
                     else if (hh == 1)
                     {
                         N_Row[hh] = abc.商品名.ToString();
                     }
                     else
                     {
                         N_Row[hh] = "";
                     }
                 }
                 dt.Rows.Add(N_Row);
             }



            foreach (DataRow abc in dt.Rows)////////////////////////////////明細
            {        
                foreach (DataColumn D_abc in dt.Columns)
                {
                    double Total = 0;
                    DateTime D_DT;
                    if (DateTime.TryParse(D_abc.ColumnName.ToString(), out D_DT) == true)
                    {
                        string d_1 = dateTimePicker1.Value.ToString("yyyy/MM/dd");
                        string d_2 = dateTimePicker2.Value.ToString("yyyy/MM/dd");

                        DateTime dt_1 = DateTime.Parse(d_1);
                        DateTime dt_2 = DateTime.Parse(d_2);

                        if (dt_1 <= D_DT && D_DT <= dt_2)
                        {
                            foreach (DataSet12.DataTable_OrderRow O_abc in dataSet12.DataTable_Order)
                            {
                                DateTime O_DT = DateTime.Parse(O_abc.納品日.ToString());

                                if (abc[0].ToString() == O_abc.商品コード.ToString()
                                    && D_DT == O_DT)
                                {
                                    Total += double.Parse(O_abc.数量.ToString());
                                }
                            }

                            abc[D_abc] = Total.ToString();
                        }
                       
                    }
                   

                }

              

            }
           

            foreach (DataRow abc in dt.Rows)/////////////////////////////////合計
            {
                double Total = 0;
                foreach (DataColumn D_abc in dt.Columns)
                {
                    DateTime D_DT;
                    if (DateTime.TryParse(D_abc.ColumnName.ToString(), out D_DT) == true)
                    {
                        string d_1 = dateTimePicker1.Value.ToString("yyyy/MM/dd");
                        string d_2 = dateTimePicker2.Value.ToString("yyyy/MM/dd");

                        DateTime dt_1 = DateTime.Parse(d_1);
                        DateTime dt_2 = DateTime.Parse(d_2);

                        if (dt_1 <= D_DT && D_DT <= dt_2)
                        {

                            Total += double.Parse(abc[D_abc].ToString());
                        }
                    }
                }

                abc[dt.Columns.Count - 1] = Total.ToString();
               
            }

            foreach (DataRow abc in dt.Rows)///////////////////////////////////"0"null
            {
                foreach (DataColumn D_abc in dt.Columns)
                {
                    if (abc[D_abc].ToString() == "0")
                    {
                        abc[D_abc] = "";
                    }
                }
               
            }

            dataGridView1.DataSource = dt;

            dataGridView1.EnableHeadersVisualStyles = false;
            dataGridView1.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.EnableResizing;
            dataGridView1.ColumnHeadersHeight = 40;

            for (int hh = 0; hh < dataGridView1.Columns.Count; hh++)////////////////スタイル
            {
                if (hh == 0)
                {
                    dataGridView1.Columns[hh].Width = 90;
                }
                else if (hh == 1)
                {
                    dataGridView1.Columns[hh].Width = 100;
                }
                else
                {
                    dataGridView1.Columns[hh].Width = 70;
                }
                dataGridView1.ColumnHeadersDefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
                dataGridView1.ColumnHeadersDefaultCellStyle.BackColor = Color.WhiteSmoke;
                dataGridView1.Columns[0].DefaultCellStyle.BackColor = Color.WhiteSmoke;
                dataGridView1.Columns[1].DefaultCellStyle.BackColor = Color.WhiteSmoke;

                string Header_N = dt.Columns[hh].ColumnName.ToString();
                DateTime H_dt;
                if (DateTime.TryParse(Header_N, out H_dt) == true)
                {
                    if (H_dt.DayOfWeek == 0)
                    {
                        dataGridView1.Columns[hh].HeaderCell.Style.ForeColor = Color.Red;
                    }
                    DateTime T_dt = DateTime.Now;
                    if (H_dt.ToString("yyyyMMdd") == T_dt.ToString("yyyyMMdd"))
                    {
                        dataGridView1.Columns[hh].HeaderCell.Style.BackColor = Color.MistyRose;
                        dataGridView1.Columns[hh].DefaultCellStyle.BackColor = Color.MistyRose;
                    }
                    dataGridView1.Columns[hh].HeaderCell.Value = H_dt.Day.ToString() + "(" + H_dt.ToString("ddd") + ")";

                    string d_1 = dateTimePicker1.Value.ToString("yyyyMMdd");
                    if (d_1 == H_dt.ToString("yyyyMMdd"))
                    {
                        dataGridView1.FirstDisplayedScrollingColumnIndex = hh;
                    }


                }

            }

            dataGridView1.Columns[dataGridView1.Columns.Count - 1].DefaultCellStyle.Font = new Font(dataGridView1.Font, FontStyle.Bold);

            dataGridView1.Columns[1].Frozen = true;

           

        }
        
        private void Item_Shukei_Uri()
        {
            dataGridView1.Columns.Clear();

            DataTable dt = new DataTable();

            DateTime d_time = DateTime.Parse(label1.Text);
            DateTime F_date = new DateTime(d_time.Year, d_time.Month, 1);


            dt.Columns.Add("商品コード", typeof(string));/////////////////////////////////////ヘッダー
            dt.Columns.Add("商品名", typeof(string));
            while (d_time.Month == F_date.Month)
            {
                dt.Columns.Add(F_date.ToString(), typeof(string));
                F_date = F_date.AddDays(1);
            }
            dt.Columns.Add("合 計", typeof(string));

            foreach (DataSet12.DataTable_ItemRow abc in dataSet12.DataTable_Item)///////////////ロウヘッダー
            {
                DataRow N_Row = dt.NewRow();
                for (int hh = 0; hh < dt.Columns.Count; hh++)
                {
                    if (hh == 0)
                    {
                        N_Row[hh] = abc.商品コード.ToString();
                    }
                    else if (hh == 1)
                    {
                        N_Row[hh] = abc.商品名.ToString();
                    }
                    else
                    {
                        N_Row[hh] = "";
                    }
                }
                dt.Rows.Add(N_Row);
            }

            DataRow NN_Row = dt.NewRow();
            for (int hh = 0; hh < dt.Columns.Count; hh++)
            {
                if (hh == 0)
                {
                    NN_Row[hh] = "";
                }
                else if (hh == 1)
                {
                    NN_Row[hh] = "合　計";
                }
                else
                {
                    NN_Row[hh] = "";
                }
            }
            dt.Rows.Add(NN_Row);


            foreach (DataRow abc in dt.Rows)////////////////////////////////明細
            {
                foreach (DataColumn D_abc in dt.Columns)
                {
                    int Total = 0;
                    DateTime D_DT;
                    if (DateTime.TryParse(D_abc.ColumnName.ToString(), out D_DT) == true)
                    {
                        string d_1 = dateTimePicker1.Value.ToString("yyyy/MM/dd");
                        string d_2 = dateTimePicker2.Value.ToString("yyyy/MM/dd");

                        DateTime dt_1 = DateTime.Parse(d_1);
                        DateTime dt_2 = DateTime.Parse(d_2);
                        if (dt_1 <= D_DT && D_DT <= dt_2)
                        {

                            foreach (DataSet12.DataTable_OrderRow O_abc in dataSet12.DataTable_Order)
                            {
                                DateTime O_DT = DateTime.Parse(O_abc.納品日.ToString());
                                if (O_abc.商品コード.ToString() == "")
                                {
                                    O_abc.商品コード = "0";
                                }

                                if (abc[0].ToString() == O_abc.商品コード.ToString()
                                    && D_DT == O_DT)
                                {
                                    if (O_abc.金額.ToString() == "")
                                    {
                                        O_abc.金額 = "0";
                                    }
                                    Total += int.Parse(O_abc.金額.ToString().Replace(",", ""));
                                }
                            }

                            abc[D_abc] = Total.ToString("n0");
                        }
                    }
                }
            }

            foreach (DataRow abc in dt.Rows)/////////////////////////////////横合計
            {
                int Total = 0;

                foreach (DataColumn D_abc in dt.Columns)
                {
                    DateTime D_DT;
                    if (DateTime.TryParse(D_abc.ColumnName.ToString(), out D_DT) == true)
                    {
                        string d_1 = dateTimePicker1.Value.ToString("yyyy/MM/dd");
                        string d_2 = dateTimePicker2.Value.ToString("yyyy/MM/dd");

                        DateTime dt_1 = DateTime.Parse(d_1);
                        DateTime dt_2 = DateTime.Parse(d_2);

                        if (dt_1 <= D_DT && D_DT <= dt_2)
                        {
                            Total += int.Parse(abc[D_abc].ToString().Replace(",", ""));
                        }
                    }


                }
                abc[dt.Columns.Count - 1] = Total.ToString("n0");
            }

            


            for (int hh = 0; hh < dt.Columns.Count; hh++)/////////////////////////////////縦合計
            {
                DateTime D_Dtt;
                if (DateTime.TryParse(dt.Columns[hh].ColumnName.ToString(), out D_Dtt) == true)
                {
                    string d_1 = dateTimePicker1.Value.ToString("yyyy/MM/dd");
                    string d_2 = dateTimePicker2.Value.ToString("yyyy/MM/dd");

                    DateTime dt_1 = DateTime.Parse(d_1);
                    DateTime dt_2 = DateTime.Parse(d_2);

                    if (dt_1 <= D_Dtt && D_Dtt <= dt_2)
                    {
                        int Total = 0;
                        foreach (DataRow abc in dt.Rows)
                        {
                            Total += int.Parse(abc[hh].ToString().Replace(",", ""));
                        }

                        dt.Rows[dt.Rows.Count - 1][hh] = Total.ToString("n0");
                    }
                }
            }

            int All_Total = 0;
            foreach (DataRow abc in dt.Rows)
            {
               
                All_Total += int.Parse(abc[dt.Columns.Count - 1].ToString().Replace(",", ""));
            }
            dt.Rows[dt.Rows.Count - 1][dt.Columns.Count - 1] = All_Total.ToString("n0");





            foreach (DataRow abc in dt.Rows)///////////////////////////////////"0"null
            {
                foreach (DataColumn D_abc in dt.Columns)
                {
                    if (abc[D_abc].ToString() == "0")
                    {
                        abc[D_abc] = "";
                    }
                }
            }

            dataGridView1.DataSource = dt;
            dataGridView1.EnableHeadersVisualStyles = false;
            dataGridView1.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.EnableResizing;
            dataGridView1.ColumnHeadersHeight = 40;

            for (int hh = 0; hh < dataGridView1.Columns.Count; hh++)////////////////スタイル
            {
                if (hh == 0)
                {
                    dataGridView1.Columns[hh].Width = 90;
                }
                else if (hh == 1)
                {
                    dataGridView1.Columns[hh].Width = 100;
                }
                else
                {
                    dataGridView1.Columns[hh].Width = 70;
                }
                dataGridView1.ColumnHeadersDefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
                dataGridView1.ColumnHeadersDefaultCellStyle.BackColor = Color.WhiteSmoke;
                dataGridView1.Columns[0].DefaultCellStyle.BackColor = Color.WhiteSmoke;
                dataGridView1.Columns[1].DefaultCellStyle.BackColor = Color.WhiteSmoke;

                string Header_N = dt.Columns[hh].ColumnName.ToString();
                DateTime H_dt;
                if (DateTime.TryParse(Header_N, out H_dt) == true)
                {
                    if (H_dt.DayOfWeek == 0)
                    {
                        dataGridView1.Columns[hh].HeaderCell.Style.ForeColor = Color.Red;
                    }
                    DateTime T_dt = DateTime.Now;
                    if (H_dt.ToString("yyyyMMdd") == T_dt.ToString("yyyyMMdd"))
                    {
                        dataGridView1.Columns[hh].HeaderCell.Style.BackColor = Color.MistyRose;
                        dataGridView1.Columns[hh].DefaultCellStyle.BackColor = Color.MistyRose;
                    }
                    dataGridView1.Columns[hh].HeaderCell.Value = H_dt.Day.ToString() + "(" + H_dt.ToString("ddd") + ")";
                    string d_1 = dateTimePicker1.Value.ToString("yyyyMMdd");
                    if (d_1 == H_dt.ToString("yyyyMMdd"))
                    {
                        dataGridView1.FirstDisplayedScrollingColumnIndex = hh;
                    }
                }

            }

            dataGridView1.Rows[dataGridView1.Rows.Count - 1].DefaultCellStyle.Font = new Font(dataGridView1.Font, FontStyle.Bold);
            dataGridView1.Columns[dataGridView1.Columns.Count - 1].DefaultCellStyle.Font = new Font(dataGridView1.Font, FontStyle.Bold);

            dataGridView1.Columns[1].Frozen = true;

            
        }

        private void Item_Shukei_Ara()
        {
            dataGridView1.Columns.Clear();

            DataTable dt = new DataTable();

            DateTime d_time = DateTime.Parse(label1.Text);
            DateTime F_date = new DateTime(d_time.Year, d_time.Month, 1);


            dt.Columns.Add("商品コード", typeof(string));/////////////////////////////////////ヘッダー
            dt.Columns.Add("商品名", typeof(string));
            while (d_time.Month == F_date.Month)
            {
                dt.Columns.Add(F_date.ToString(), typeof(string));
                F_date = F_date.AddDays(1);
            }
            dt.Columns.Add("合 計", typeof(string));

            foreach (DataSet12.DataTable_ItemRow abc in dataSet12.DataTable_Item)///////////////ロウヘッダー
            {
                DataRow N_Row = dt.NewRow();
                for (int hh = 0; hh < dt.Columns.Count; hh++)
                {
                    if (hh == 0)
                    {
                        N_Row[hh] = abc.商品コード.ToString();
                    }
                    else if (hh == 1)
                    {
                        N_Row[hh] = abc.商品名.ToString();
                    }
                    else
                    {
                        N_Row[hh] = "";
                    }
                }
                dt.Rows.Add(N_Row);
            }

            DataRow NN_Row = dt.NewRow();
            for (int hh = 0; hh < dt.Columns.Count; hh++)
            {
                if (hh == 0)
                {
                    NN_Row[hh] = "";
                }
                else if (hh == 1)
                {
                    NN_Row[hh] = "合　計";
                }
                else
                {
                    NN_Row[hh] = "";
                }
            }
            dt.Rows.Add(NN_Row);


            foreach (DataRow abc in dt.Rows)////////////////////////////////明細
            {
                foreach (DataColumn D_abc in dt.Columns)
                {
                    double Total = 0;
                    DateTime D_DT;
                    if (DateTime.TryParse(D_abc.ColumnName.ToString(), out D_DT) == true)
                    {
                        string d_1 = dateTimePicker1.Value.ToString("yyyy/MM/dd");
                        string d_2 = dateTimePicker2.Value.ToString("yyyy/MM/dd");

                        DateTime dt_1 = DateTime.Parse(d_1);
                        DateTime dt_2 = DateTime.Parse(d_2);

                        if (dt_1 <= D_DT && D_DT <= dt_2)
                        {
                            foreach (DataSet12.DataTable_OrderRow O_abc in dataSet12.DataTable_Order)
                            {
                                DateTime O_DT = DateTime.Parse(O_abc.納品日.ToString());
                                if (O_abc.商品コード.ToString() == "")
                                {
                                    O_abc.商品コード = "0";
                                }

                                if (abc[0].ToString() == O_abc.商品コード.ToString()
                                    && D_DT == O_DT)
                                {
                                    if (O_abc.売単価.ToString() == "")
                                    {
                                        O_abc.売単価 = "0";
                                    }
                                    if (O_abc.仕入単価.ToString() == "")
                                    {
                                        O_abc.仕入単価 = "0";
                                    }
                                    if (O_abc.数量.ToString() == "")
                                    {
                                        O_abc.数量 = "0";
                                    }


                                    double Uri = double.Parse(O_abc.売単価.ToString().Replace(",", ""));
                                    double Siire = double.Parse(O_abc.仕入単価.ToString().Replace(",", ""));
                                    double Suryou = double.Parse(O_abc.数量.ToString().Replace(",", ""));
                                    Total += (Uri - Siire) * Suryou;

                                }
                            }

                            abc[D_abc] = Total.ToString("n0");
                        }
                    }
                }
            }

            foreach (DataRow abc in dt.Rows)/////////////////////////////////横合計
            {
                int Total = 0;

                foreach (DataColumn D_abc in dt.Columns)
                {
                    DateTime D_DT;
                    if (DateTime.TryParse(D_abc.ColumnName.ToString(), out D_DT) == true)
                    {
                        string d_1 = dateTimePicker1.Value.ToString("yyyy/MM/dd");
                        string d_2 = dateTimePicker2.Value.ToString("yyyy/MM/dd");

                        DateTime dt_1 = DateTime.Parse(d_1);
                        DateTime dt_2 = DateTime.Parse(d_2);

                        if (dt_1 <= D_DT && D_DT <= dt_2)
                        {
                            Total += int.Parse(abc[D_abc].ToString().Replace(",", ""));
                        }
                    }


                }
                abc[dt.Columns.Count - 1] = Total.ToString("n0");
            }




            for (int hh = 0; hh < dt.Columns.Count; hh++)/////////////////////////////////縦合計
            {
                DateTime D_Dtt;
                if (DateTime.TryParse(dt.Columns[hh].ColumnName.ToString(), out D_Dtt) == true)
                {
                    string d_1 = dateTimePicker1.Value.ToString("yyyy/MM/dd");
                    string d_2 = dateTimePicker2.Value.ToString("yyyy/MM/dd");

                    DateTime dt_1 = DateTime.Parse(d_1);
                    DateTime dt_2 = DateTime.Parse(d_2);

                    if (dt_1 <= D_Dtt && D_Dtt <= dt_2)
                    {
                        int Total = 0;
                        foreach (DataRow abc in dt.Rows)
                        {
                            Total += int.Parse(abc[hh].ToString().Replace(",", ""));
                        }

                        dt.Rows[dt.Rows.Count - 1][hh] = Total.ToString("n0");
                    }
                }
            }

            int All_Total = 0;
            foreach (DataRow abc in dt.Rows)
            {

                All_Total += int.Parse(abc[dt.Columns.Count - 1].ToString().Replace(",", ""));
            }
            dt.Rows[dt.Rows.Count - 1][dt.Columns.Count - 1] = All_Total.ToString("n0");





            foreach (DataRow abc in dt.Rows)///////////////////////////////////"0"null
            {
                foreach (DataColumn D_abc in dt.Columns)
                {
                    if (abc[D_abc].ToString() == "0")
                    {
                        abc[D_abc] = "";
                    }

                }
            }

            dataGridView1.DataSource = dt;
            dataGridView1.EnableHeadersVisualStyles = false;
            dataGridView1.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.EnableResizing;
            dataGridView1.ColumnHeadersHeight = 40;

            for (int hh = 0; hh < dataGridView1.Columns.Count; hh++)////////////////スタイル
            {
                if (hh == 0)
                {
                    dataGridView1.Columns[hh].Width = 90;
                }
                else if (hh == 1)
                {
                    dataGridView1.Columns[hh].Width = 100;
                }
                else
                {
                    dataGridView1.Columns[hh].Width = 70;
                }
                dataGridView1.ColumnHeadersDefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
                dataGridView1.ColumnHeadersDefaultCellStyle.BackColor = Color.WhiteSmoke;
                dataGridView1.Columns[0].DefaultCellStyle.BackColor = Color.WhiteSmoke;
                dataGridView1.Columns[1].DefaultCellStyle.BackColor = Color.WhiteSmoke;

                string Header_N = dt.Columns[hh].ColumnName.ToString();
                DateTime H_dt;
                if (DateTime.TryParse(Header_N, out H_dt) == true)
                {
                    if (H_dt.DayOfWeek == 0)
                    {
                        dataGridView1.Columns[hh].HeaderCell.Style.ForeColor = Color.Red;
                    }
                    DateTime T_dt = DateTime.Now;
                    if (H_dt.ToString("yyyyMMdd") == T_dt.ToString("yyyyMMdd"))
                    {
                        dataGridView1.Columns[hh].HeaderCell.Style.BackColor = Color.MistyRose;
                        dataGridView1.Columns[hh].DefaultCellStyle.BackColor = Color.MistyRose;
                    }
                    dataGridView1.Columns[hh].HeaderCell.Value = H_dt.Day.ToString() + "(" + H_dt.ToString("ddd") + ")";
                    string d_1 = dateTimePicker1.Value.ToString("yyyyMMdd");
                    if (d_1 == H_dt.ToString("yyyyMMdd"))
                    {
                        dataGridView1.FirstDisplayedScrollingColumnIndex = hh;
                    }
                }

            }

            dataGridView1.Rows[dataGridView1.Rows.Count - 1].DefaultCellStyle.Font = new Font(dataGridView1.Font, FontStyle.Bold);
            dataGridView1.Columns[dataGridView1.Columns.Count - 1].DefaultCellStyle.Font = new Font(dataGridView1.Font, FontStyle.Bold);

            dataGridView1.Columns[1].Frozen = true;

           
        }

        
    }
}
