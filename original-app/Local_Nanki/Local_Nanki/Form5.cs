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
    public partial class Form5 : Form
    {
        public Form5(DataSet d1, DataSet d2, DataSet d3, DataSet d4)
        {
            InitializeComponent();
            ds_1 = d1;
            ds_2 = d2;
            ds_3 = d3;
            ds_4 = d4;
        }

        private void Form5_Load(object sender, EventArgs e)
        {
            this.Icon = global::Local_Nanki.Properties.Resources.k_01;

            dt_1 = ds_1.Tables[0];
            dt_2 = ds_2.Tables[0];
            dt_3 = ds_3.Tables[0];
            dt_4 = ds_4.Tables[0];

            for (int hh = 0; hh < dt_1.Rows.Count; hh++)
            {
                DataRow Ne_Row = dataSet15.DataTable1.NewRow();
                for (int ii = 0; ii < dt_1.Columns.Count; ii++)
                {
                    Ne_Row[ii] = dt_1.Rows[hh][ii].ToString();
                }
                dataSet15.DataTable1.Rows.Add(Ne_Row);
            }

            for (int hh = 0; hh < dt_2.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet15.DataTable2.NewRow();
                for (int ii = 0; ii < dt_2.Columns.Count; ii++)
                {
                    N_Row[ii] = dt_2.Rows[hh][ii].ToString();
                }
                dataSet15.DataTable2.Rows.Add(N_Row);
            }

            for (int hh = 0; hh < dt_3.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet15.DataTable3.NewRow();
                for (int ii = 0; ii < dt_3.Columns.Count; ii++)
                {
                    N_Row[ii] = dt_3.Rows[hh][ii].ToString();
                }
                dataSet15.DataTable3.Rows.Add(N_Row);
            }

            for (int hh = 0; hh < dt_4.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet15.DataTable4.NewRow();
                for (int ii = 0; ii < dt_4.Columns.Count; ii++)
                {
                    N_Row[ii] = dt_4.Rows[hh][ii].ToString();
                }
                dataSet15.DataTable4.Rows.Add(N_Row);
            }



            Shuukei();
            foreach (DataGridViewColumn c in dataGridView1.Columns)
            {
                c.SortMode = DataGridViewColumnSortMode.NotSortable;
            }

        }

        private DataSet ds_1;
        private DataTable dt_1;
        private DataSet ds_2;
        private DataTable dt_2;
        private DataSet ds_3;
        private DataTable dt_3;
        private DataSet ds_4;
        private DataTable dt_4;

        private void button2_Click(object sender, EventArgs e)////////////////閉じる
        {
            this.Close();
        }

        private int Print_Pos;
        private int Print_Count;
        private int Print_PP;
        private void button1_Click(object sender, EventArgs e)////////////////発注書印刷
        {
            for (int hh = 3; hh < dataGridView1.Columns.Count; hh++)
            {
                for (int ii = 0; ii < dataGridView1.Rows.Count; ii++)
                {
                    if (dataGridView1.Rows[ii].Cells[hh].Value.ToString() != "")
                    {
                        Print_Pos = hh;

                        //printPreviewDialog1.Document = printDocument1;
                        //printPreviewDialog1.Width = 1000;
                        //printPreviewDialog1.Height = 700;
                        //printPreviewDialog1.StartPosition = FormStartPosition.CenterScreen;
                        //printPreviewDialog1.ShowDialog();

                        printDocument1.Print();

                        break;
                    }
                }
                
            }
        }

        private void contextMenuStrip1_Opening(object sender, CancelEventArgs e)
        {
            int Pos = 0;
            foreach (DataGridViewCell c in dataGridView1.SelectedCells)
            {
                Pos = c.ColumnIndex;
            }

            if (Pos == 0 || Pos == 1 || Pos == 2)
            {
                e.Cancel = true;
            }
        }

        private void 市場発注書印刷ToolStripMenuItem_Click(object sender, EventArgs e)
        {
            DateTime dt = dateTimePicker1.Value;
            DialogResult ret =
                MessageBox.Show("引取日 " + dt.ToString("M月d日（ddd）") + "でよろしいですか？", "市場発注書",
                MessageBoxButtons.OKCancel, MessageBoxIcon.Asterisk);

            if (ret == DialogResult.OK)
            {

                foreach (DataGridViewCell c in dataGridView1.SelectedCells)
                {
                    Print_Pos = c.ColumnIndex;
                }


                //printPreviewDialog1.Document = printDocument1;
                //printPreviewDialog1.Width = 1000;
                //printPreviewDialog1.Height = 700;
                //printPreviewDialog1.StartPosition = FormStartPosition.CenterScreen;
                //printPreviewDialog1.ShowDialog();

                printDocument1.Print();
            }

        }

        private void ピース出荷依頼印刷ToolStripMenuItem_Click(object sender, EventArgs e)
        {
            DateTime dt = dateTimePicker1.Value;
            DialogResult ret = 
                MessageBox.Show("引取日 " + dt.ToString("M月d日（ddd）") + "でよろしいですか？", "ピース発注書",
                MessageBoxButtons.OKCancel, MessageBoxIcon.Asterisk);

            if (ret == DialogResult.OK)
            {

                foreach (DataGridViewCell c in dataGridView1.SelectedCells)
                {
                    Print_Pos = c.ColumnIndex;
                }

                //printPreviewDialog1.Document = printDocument2;
                //printPreviewDialog1.Width = 1000;
                //printPreviewDialog1.Height = 700;
                //printPreviewDialog1.StartPosition = FormStartPosition.CenterScreen;
                //printPreviewDialog1.ShowDialog();

                 printDocument2.Print();
            }

        }

        private void printDocument1_PrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e)
        {
            int Header = 50;//////////////////////ヘッダー
            int Right = 60;///////////////////////左余白
            int Header_Gyou = 20;//////////////////ヘッダー行間
            int Pitch = 0;/////////////////////////ピッチ
            int Meisai_Width = 700;/////////////////明細幅
            int Meisai_Header = 0;//////////////////明細高さスタート位置
            int Meisai_Height = 0;//////////////////明細高さ
            int Meisai_Pitch = 27;//////////////////明細行数
            int Meisai_Gyou = 30;///////////////////明細行間

            e.Graphics.DrawString("発　注　書", new Font("ＭＳ Ｐゴシック", 22), Brushes.Black, 300, Header);

            Pitch = Header + Header_Gyou + 20;
            int R_Pitch = Pitch;
            e.Graphics.DrawString(dataGridView1.Columns[Print_Pos].HeaderCell.Value.ToString().Remove(0,3) + "　御中", new Font("ＭＳ Ｐゴシック", 20, FontStyle.Bold), Brushes.Black, Right, Pitch);
            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch + Header_Gyou+5,
              Right + e.Graphics.MeasureString(dataGridView1.Columns[Print_Pos].HeaderCell.Value.ToString().Remove(0, 3) + "　御中", new Font("ＭＳ Ｐゴシック", 20, FontStyle.Bold)).Width, Pitch + Header_Gyou + 5);

            R_Pitch += 15;
            string J_Yubin = dataSet15.DataTable4.Rows[0][0].ToString();
            if (J_Yubin != "")
            {
                J_Yubin = "〒" + J_Yubin;
            }

            e.Graphics.DrawString("８２０９", new Font("ＭＳ Ｐゴシック", 16), Brushes.Black, Right + 470, R_Pitch - (Header_Gyou + 5));
            //R_Pitch += Header_Gyou + 5;

            e.Graphics.DrawString(dataSet15.DataTable4.Rows[0][1].ToString(), new Font("ＭＳ Ｐゴシック", 14), Brushes.Black, Right + 470, R_Pitch);
            R_Pitch += Header_Gyou + 5;

           // e.Graphics.DrawString(J_Yubin, new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 470, R_Pitch);
           // R_Pitch += Header_Gyou;

            e.Graphics.DrawString(dataSet15.DataTable4.Rows[0][2].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 470, R_Pitch);
            R_Pitch += Header_Gyou;

            e.Graphics.DrawString(dataSet15.DataTable4.Rows[0][3].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 470, R_Pitch);
            R_Pitch += Header_Gyou;

            e.Graphics.DrawString(dataSet15.DataTable4.Rows[0][4].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 470, R_Pitch);

            Pitch += Header_Gyou + 10;

           

            Pitch += Header_Gyou;

            /*e.Graphics.FillRectangle(new SolidBrush(Color.Black), Right + 220, Pitch-30, 230, 70);


            e.Graphics.DrawString("ＡＭ５：３０までに" + "\r\n" + "Ｄ－２０番駐車場の後ろに" + "\r\n" + "お願いします",
            new Font("ＭＳ Ｐゴシック", 13), Brushes.White, Right + 230, Pitch - 25);
            */

            e.Graphics.DrawString("引取日 " + dateTimePicker3.Value.ToString("M月d日(ddd)"),
            new Font("ＭＳ Ｐゴシック", 17), Brushes.Black, Right, Pitch);



            Pitch += Header_Gyou + 20;
            e.Graphics.DrawString("下記の通り注文致します", new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right, Pitch);

            e.Graphics.DrawString("【 お手数ですが商品に 『８２０９－Ａ』 と記入して下さい 】", new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 135, Pitch + 20);

            Pitch += Header_Gyou + 20;

            Meisai_Header = Pitch;

            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);

            e.Graphics.DrawString("コード", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 30, Pitch + 7);
            e.Graphics.DrawString("商　品　名", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 170, Pitch + 7);
            e.Graphics.DrawString("規 格", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 355, Pitch + 7);
            e.Graphics.DrawString("数量", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 435, Pitch + 7);
            e.Graphics.DrawString("単 位", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 495, Pitch + 7);
            e.Graphics.DrawString("単 価", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 565, Pitch + 7);
            e.Graphics.DrawString("備 考", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 640, Pitch + 7);

            for (int hh = 0; hh < Meisai_Pitch + 1; hh++)
            {
                Pitch += Meisai_Gyou;
                e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);
                Meisai_Height += Meisai_Gyou;
            }

           
            e.Graphics.DrawString("※単価欄に価格を記入してご返信をお願い致します", new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 330, Pitch + 15);


            e.Graphics.DrawLine(new Pen(Color.Black), Right, Meisai_Header, Right, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 100, Meisai_Header, Right + 100, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 330, Meisai_Header, Right + 330, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 420, Meisai_Header, Right + 420, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 480, Meisai_Header, Right + 480, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 550, Meisai_Header, Right + 550, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 620, Meisai_Header, Right + 620, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + Meisai_Width, Meisai_Header, Right + Meisai_Width, Meisai_Header + Meisai_Height);



           
            Pitch = Meisai_Header + Meisai_Gyou;

            for (int hh = Print_Count; hh < dataGridView1.Rows.Count; hh++)
            {
                if (dataGridView1.Rows[hh].Cells[Print_Pos].Value.ToString() != "")
                {
                    string Tanni = "";
                    foreach (DataSet15.DataTable3Row abc in dataSet15.DataTable3)
                    {
                        if (dataGridView1.Rows[hh].Cells[0].Value.ToString() == abc[0].ToString())
                        {
                            Tanni = abc[6].ToString();
                            break;
                        }
                    }

                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[0].Value.ToString(), new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 20, Pitch + 7);

                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[1].Value.ToString(), new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 105, Pitch + 7);

                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[2].Value.ToString(),
                        new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, (Right + 395) - e.Graphics.MeasureString(dataGridView1.Rows[hh].Cells[2].Value.ToString(), new Font("ＭＳ Ｐゴシック", 12)).Width, Pitch + 7);

                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[Print_Pos].Value.ToString(),
                        new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, (Right + 465) - e.Graphics.MeasureString(dataGridView1.Rows[hh].Cells[Print_Pos].Value.ToString(), new Font("ＭＳ Ｐゴシック", 12)).Width, Pitch + 7);

                    e.Graphics.DrawString(Tanni, new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, (Right + 525) - e.Graphics.MeasureString(Tanni, new Font("ＭＳ Ｐゴシック", 12)).Width, Pitch + 7);

                    Pitch += Meisai_Gyou;
                    Print_PP++;

                }

                Print_Count++;

                if (Print_Count == dataGridView1.Rows.Count)
                {
                    break;
                }
               

                if (Print_PP >= Meisai_Pitch)
                {
                    break;
                }

            }

           
            if (Print_Count == dataGridView1.Rows.Count)
            {
                e.HasMorePages = false;
            }
            if (Print_PP >= Meisai_Pitch)
            {
                e.HasMorePages = true;
                Print_PP = 0;
            }


        }

        private void printDocument1_BeginPrint(object sender, System.Drawing.Printing.PrintEventArgs e)
        {
            Print_Count = 0;
            Print_PP = 0;
        }

        private void printDocument2_PrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e)
        {
            int Header = 50;//////////////////////ヘッダー
            int Right = 60;///////////////////////左余白
            int Header_Gyou = 20;//////////////////ヘッダー行間
            int Pitch = 0;/////////////////////////ピッチ
            int Meisai_Width = 700;/////////////////明細幅
            int Meisai_Header = 0;//////////////////明細高さスタート位置
            int Meisai_Height = 0;//////////////////明細高さ
            int Meisai_Pitch = 27;//////////////////明細行数
            int Meisai_Gyou = 30;///////////////////明細行間

            e.Graphics.DrawString("発　注　書", new Font("ＭＳ Ｐゴシック", 22), Brushes.Black, 300, Header);

            Pitch = Header + Header_Gyou + 20;
            int R_Pitch = Pitch;
            e.Graphics.DrawString(dataGridView1.Columns[Print_Pos].HeaderCell.Value.ToString().Remove(0, 3) + "　御中", new Font("ＭＳ Ｐゴシック", 20, FontStyle.Bold), Brushes.Black, Right, Pitch);
            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch + Header_Gyou + 5,
              Right + e.Graphics.MeasureString(dataGridView1.Columns[Print_Pos].HeaderCell.Value.ToString().Remove(0, 3) + "　御中", new Font("ＭＳ Ｐゴシック", 20, FontStyle.Bold)).Width, Pitch + Header_Gyou + 5);

            R_Pitch += 15;
            string J_Yubin = dataSet15.DataTable4.Rows[0][0].ToString();
            if (J_Yubin != "")
            {
                J_Yubin = "〒" + J_Yubin;
            }

           

            e.Graphics.DrawString(dataSet15.DataTable4.Rows[0][1].ToString(), new Font("ＭＳ Ｐゴシック", 14), Brushes.Black, Right + 470, R_Pitch);
            R_Pitch += Header_Gyou + 5;

            // e.Graphics.DrawString(J_Yubin, new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 470, R_Pitch);
            // R_Pitch += Header_Gyou;

            e.Graphics.DrawString(dataSet15.DataTable4.Rows[0][2].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 470, R_Pitch);
            R_Pitch += Header_Gyou;

            e.Graphics.DrawString(dataSet15.DataTable4.Rows[0][3].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 470, R_Pitch);
            R_Pitch += Header_Gyou;

            e.Graphics.DrawString(dataSet15.DataTable4.Rows[0][4].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 470, R_Pitch);

            Pitch += Header_Gyou + 10;



            Pitch += Header_Gyou;

            e.Graphics.DrawString("引取日 " + dateTimePicker3.Value.ToString("M月d日(ddd)"),
           new Font("ＭＳ Ｐゴシック", 17), Brushes.Black, Right, Pitch);
            Pitch += Header_Gyou + 20;
            e.Graphics.DrawString("下記の通り注文致します", new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right, Pitch);

           
            Pitch += Header_Gyou + 20;

            Meisai_Header = Pitch;

            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);

            e.Graphics.DrawString("コード", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 30, Pitch + 7);
            e.Graphics.DrawString("商　品　名", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 170, Pitch + 7);
            e.Graphics.DrawString("規 格", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 355, Pitch + 7);
            e.Graphics.DrawString("数量", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 435, Pitch + 7);
            e.Graphics.DrawString("単 位", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 495, Pitch + 7);
            //e.Graphics.DrawString("単 価", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 565, Pitch + 7);
            e.Graphics.DrawString("備  考", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 600, Pitch + 7);

            for (int hh = 0; hh < Meisai_Pitch + 1; hh++)
            {
                Pitch += Meisai_Gyou;
                e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);
                Meisai_Height += Meisai_Gyou;
            }


            

            e.Graphics.DrawLine(new Pen(Color.Black), Right, Meisai_Header, Right, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 100, Meisai_Header, Right + 100, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 330, Meisai_Header, Right + 330, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 420, Meisai_Header, Right + 420, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 480, Meisai_Header, Right + 480, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 550, Meisai_Header, Right + 550, Meisai_Header + Meisai_Height);

           // e.Graphics.DrawLine(new Pen(Color.Black), Right + 620, Meisai_Header, Right + 620, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + Meisai_Width, Meisai_Header, Right + Meisai_Width, Meisai_Header + Meisai_Height);




            Pitch = Meisai_Header + Meisai_Gyou;

            for (int hh = Print_Count; hh < dataGridView1.Rows.Count; hh++)
            {
                if (dataGridView1.Rows[hh].Cells[Print_Pos].Value.ToString() != "")
                {
                    string Tanni = "";
                    foreach (DataSet15.DataTable3Row abc in dataSet15.DataTable3)
                    {
                        if (dataGridView1.Rows[hh].Cells[0].Value.ToString() == abc[0].ToString())
                        {
                            Tanni = abc[6].ToString();
                            break;
                        }
                    }

                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[0].Value.ToString(), new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 20, Pitch + 7);

                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[1].Value.ToString(), new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 105, Pitch + 7);

                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[2].Value.ToString(),
                        new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, (Right + 395) - e.Graphics.MeasureString(dataGridView1.Rows[hh].Cells[2].Value.ToString(), new Font("ＭＳ Ｐゴシック", 12)).Width, Pitch + 7);

                    e.Graphics.DrawString(dataGridView1.Rows[hh].Cells[Print_Pos].Value.ToString(),
                        new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, (Right + 465) - e.Graphics.MeasureString(dataGridView1.Rows[hh].Cells[Print_Pos].Value.ToString(), new Font("ＭＳ Ｐゴシック", 12)).Width, Pitch + 7);

                    e.Graphics.DrawString(Tanni, new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, (Right + 525) - e.Graphics.MeasureString(Tanni, new Font("ＭＳ Ｐゴシック", 12)).Width, Pitch + 7);

                    Pitch += Meisai_Gyou;
                    Print_PP++;

                }

                Print_Count++;

                if (Print_Count == dataGridView1.Rows.Count)
                {
                    break;
                }


                if (Print_PP >= Meisai_Pitch)
                {
                    break;
                }

            }


            if (Print_Count == dataGridView1.Rows.Count)
            {
                e.HasMorePages = false;
            }
            if (Print_PP >= Meisai_Pitch)
            {
                e.HasMorePages = true;
                Print_PP = 0;
            }

        }

        private void printDocument2_BeginPrint(object sender, System.Drawing.Printing.PrintEventArgs e)
        {
            Print_Count = 0;
            Print_PP = 0;
        }

        private void dateTimePicker1_ValueChanged(object sender, EventArgs e)
        {
            if (dateTimePicker1.Value > dateTimePicker2.Value)
            {
                dateTimePicker2.Value = dateTimePicker1.Value;
            }

            Shuukei();
        }

        private void dateTimePicker2_ValueChanged(object sender, EventArgs e)
        {
            if (dateTimePicker2.Value < dateTimePicker1.Value)
            {
                dateTimePicker1.Value = dateTimePicker2.Value;
            }

            Shuukei();
        }

        private void Shuukei()
        {
            dataGridView1.Columns.Clear();


            DataTable dt = new DataTable();

            DateTime A_time = dateTimePicker1.Value;
            string A_t = A_time.ToString().Substring(0, 10);
            A_time = DateTime.Parse(A_t);

            DateTime B_time = dateTimePicker2.Value;
            string B_t = B_time.ToString().Substring(0, 10);
            B_time = DateTime.Parse(B_t);

            dt.Columns.Add("商品コード", typeof(string));
            dt.Columns.Add("商品名", typeof(string));
            dt.Columns.Add("規格", typeof(string));
            foreach (DataSet15.DataTable2Row abc in dataSet15.DataTable2)
            {
                dt.Columns.Add(abc[0].ToString() + abc[1].ToString(), typeof(string));/////////////////////////////////////ヘッダー
            }

            foreach (DataSet15.DataTable3Row abc in dataSet15.DataTable3)///////////////ロウヘッダー
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
                    else if (hh == 2)
                    {
                        N_Row[hh] = abc.規格.ToString();
                    }
                    else
                    {
                        N_Row[hh] = "";
                    }
                }
                dt.Rows.Add(N_Row);
            }

            dataGridView1.DataSource = dt;

            foreach (DataSet15.DataTable1Row abc in dataSet15.DataTable1)///////////////////////////明細
            {
                DateTime Date_t;// = DateTime.Parse(abc[2].ToString());

                if (DateTime.TryParse(abc[2].ToString(), out Date_t) == true)
                {
                    if (A_time <= Date_t && Date_t <= B_time && abc[3].ToString() != "")
                    {
                        foreach (DataSet15.DataTable3Row efc in dataSet15.DataTable3)
                        {
                            if (abc[3].ToString() == efc[0].ToString())
                            {
                                string Siiresaki = efc[8].ToString();

                                if (Siiresaki != "")
                                {
                                    for (int ii = 3; ii < dataGridView1.Columns.Count; ii++)
                                    {
                                        if (Siiresaki == dataGridView1.Columns[ii].HeaderText.ToString().Substring(0,3))
                                        {
                                            for (int hh = 0; hh < dataGridView1.Rows.Count; hh++)
                                            {
                                                if (abc[3].ToString() == dataGridView1.Rows[hh].Cells[0].Value.ToString())
                                                {
                                                    double Pos = double.Parse(abc[10].ToString());
                                                    string G_Pos = dataGridView1.Rows[hh].Cells[ii].Value.ToString();
                                                    if (G_Pos == "")
                                                    {
                                                        G_Pos = "0";
                                                    }
                                                    double GG = double.Parse(G_Pos);
                                                    GG += Pos;
                                                    dataGridView1.Rows[hh].Cells[ii].Value = GG.ToString();
                                                    break;
                                                }

                                            }

                                        }
                                    }

                                }

                            }
                        }


                    }
                }

            }

            for (int hh = 0; hh < dataGridView1.Columns.Count; hh++)////////////////スタイル
            {
                if (hh == 0)
                {
                    dataGridView1.Columns[hh].Width = 70;
                }
                else if (hh == 1)
                {
                    dataGridView1.Columns[hh].Width = 120;
                }
                else if (hh == 2)
                {
                    dataGridView1.Columns[hh].Width = 70;
                }
                else
                {
                    dataGridView1.Columns[hh].Width = 100;
                }
                dataGridView1.ColumnHeadersDefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
                dataGridView1.ColumnHeadersDefaultCellStyle.BackColor = Color.WhiteSmoke;
                dataGridView1.Columns[0].DefaultCellStyle.BackColor = Color.WhiteSmoke;
                dataGridView1.Columns[1].DefaultCellStyle.BackColor = Color.WhiteSmoke;
                dataGridView1.Columns[2].DefaultCellStyle.BackColor = Color.WhiteSmoke;
            }

            dataGridView1.Columns[1].Frozen = true;
        }

       
    }
}
