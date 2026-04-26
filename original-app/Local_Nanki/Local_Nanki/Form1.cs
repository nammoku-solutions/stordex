using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Net;
using System.IO;


namespace Local_Nanki
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
        }

        private System.Threading.Mutex Local_Nanki;

        private void Form1_Load(object sender, EventArgs e)
        {
            Local_Nanki = new System.Threading.Mutex(false, "Local_Nanki");
            if (Local_Nanki.WaitOne(0, false) == false)
            {
                MessageBox.Show("すでに起動しています", "ナンキ販売管理");       

                Close();
            }

            Set_Up();
            Back_UP_Start();
           

        }

        private void Form1_FormClosing(object sender, FormClosingEventArgs e)
        {

           

            
        }

        private void Form1_FormClosed(object sender, FormClosedEventArgs e)
        {

            Local_Nanki.Close();
        }

        private void Form1_Resize(object sender, EventArgs e)
        {
            if (WindowState == FormWindowState.Minimized)
            {
                ShowInTaskbar = false;
            }
        }

        private void Form3_Closed(object sender, EventArgs e)
        {
            f3_open--;
            WindowState = FormWindowState.Normal;
            ShowInTaskbar = true;

        }

        private void tabControl1_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (tabControl1.SelectedIndex == 5)
            {
                Supplier_Set();
            }
            
        }


        private void notifyIcon1_MouseDoubleClick(object sender, MouseEventArgs e)
        {
            WindowState = FormWindowState.Normal;
            ShowInTaskbar = true;
        }

        protected override void WndProc(ref Message m)/////////////////////// 閉じるﾎﾞﾀﾝを無効に ///////
        {
            const int WM_SYSCOMMAND = 0x112;
            const int SC_CLOSE = 0xF060;

            if (m.Msg == WM_SYSCOMMAND && m.WParam.ToInt32() == SC_CLOSE)
            {
                return;
            }

            base.WndProc(ref m);
        }



        ///////////////////////////////////////////　メニュー　/////////////////////////////////////////////////// 

        private void toolStripMenuItem4_Click(object sender, EventArgs e)//////////////////データファイル作成
        {
            DialogResult ret = MessageBox.Show("デスクトップにXMLデータファイルを作成します", "データファイル作成",
                MessageBoxButtons.OKCancel, MessageBoxIcon.Asterisk);
            if (ret == DialogResult.OK)
            {
                string D_Top = System.Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string D_Folder = D_Top + @"\ナンキXMLデータ";

                if (System.IO.Directory.Exists(D_Folder) != true)
                {
                    System.IO.Directory.CreateDirectory(D_Folder);
                }

                string D_File= folderpass + @"\Customer_data.xml";
                string New_File = D_Folder + @"\Customer_data.xml";
                System.IO.File.Copy(D_File, New_File, true);

                D_File = folderpass + @"\Item_data.xml";
                New_File = D_Folder + @"\Item_data.xml";
                System.IO.File.Copy(D_File, New_File, true);

                D_File = folderpass + @"\Order_data.xml";
                New_File = D_Folder + @"\Order_data.xml";
                System.IO.File.Copy(D_File, New_File, true);

                D_File = folderpass + @"\Supplier_data.xml";
                New_File = D_Folder + @"\Supplier_data.xml";
                System.IO.File.Copy(D_File, New_File, true);

                MessageBox.Show("作成しました", "データファイル作成",
                 MessageBoxButtons.OK, MessageBoxIcon.Asterisk);

            }
        }

        private void toolStripMenuItem2_Click(object sender, EventArgs e)///////////////////レジストリ設定
        {
           /* Microsoft.Win32.RegistryKey regkey =
                   Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", false);

            string[] valueNames = regkey.GetValueNames();
            int zz = 0;
            foreach (string v in valueNames)
            {
                if (v == "Starter_Nanki")
                {
                    zz = 1;
                }
            }
            regkey.Close();

            if (zz == 0)
            {
                DialogResult ret = MessageBox.Show("スタートアップに登録しますか？", "レジストリ設定", MessageBoxButtons.OKCancel, MessageBoxIcon.Asterisk);
                if (ret == DialogResult.OK)
                {
                    Microsoft.Win32.RegistryKey regkey1 =
                     Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);

                    string UpDate_Path = folderpass.Replace(@"Local_Nanki\Local_Nanki\bin\Debug\Data", @"Starter_Nanki\Starter_Nanki\");

                    regkey1.SetValue("Starter_Nanki", UpDate_Path + @"bin\Debug\Starter_Nanki.exe");
                    regkey1.Close();

                    MessageBox.Show("登録 完了しました", "レジストリ設定", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);

                }

            }
            else
            {
                DialogResult ret = MessageBox.Show("スタートアップから削除しますか？", "レジストリ設定", MessageBoxButtons.OKCancel, MessageBoxIcon.Asterisk);
                if (ret == DialogResult.OK)
                {
                    Microsoft.Win32.RegistryKey regkey2 =
                     Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
                    regkey2.DeleteValue("Starter_Nanki");

                    regkey2.Close();
                    MessageBox.Show("削除しました", "レジストリ設定", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);


                }
            }
            */
        }


        private void 終了XToolStripMenuItem_Click(object sender, EventArgs e)
        {
            DialogResult ret = MessageBox.Show("システムを終了します", "ナンキ販売管理", MessageBoxButtons.YesNo, MessageBoxIcon.Asterisk);

            if (ret == DialogResult.Yes)
            {
                this.Close();
            }
        }

        private string Data_kousin = "";
        private void 最新のToolStripMenuItem_Click(object sender, EventArgs e)
        {
            if (progressBar1.Visible == false)
            {
                Data_kousin = "True";
                progress_On("最新のデータをダウンロード");
                backgroundWorker4.RunWorkerAsync();
            }

        }

        private void バックアップより復帰RToolStripMenuItem_Click(object sender, EventArgs e)
        {
            Form8 form8 = new Form8();
            form8.ShowDialog();


        }

        private void アップデートUToolStripMenuItem_Click(object sender, EventArgs e)////////アップデート
        {
            if (dataSet13.DataTable3.Rows[0][0].ToString() == dataSet13.DataTable4.Rows[0][0].ToString())
            {
                MessageBox.Show("アップデートの必要はありません", "ナンキ販売管理",
                MessageBoxButtons.OK, MessageBoxIcon.Asterisk);

            }
            else
            {
                string UpDate_Path = folderpass.Replace(@"Local_Nanki\Local_Nanki\bin\Debug\Data", @"Up_Date_Nanki\Up_Date_Nanki\");

                System.IO.File.Copy(folderpass + @"\FTP_data.xml", UpDate_Path + @"bin\Debug\FTP_data.xml", true);

                DialogResult ret = MessageBox.Show("アップデートします", "ナンキ販売管理",
                    MessageBoxButtons.OKCancel, MessageBoxIcon.Asterisk);

                if (ret == DialogResult.OK)
                {
                    dataSet13.DataTable3.Rows[0][0] = dataSet13.DataTable4.Rows[0][0].ToString();
                    savedata_12();

                    if (progressBar1.Visible == false)
                    {
                        process1.StartInfo.FileName = UpDate_Path + @"bin\Debug\Up_Date_Nanki.exe";
                        process1.StartInfo.WorkingDirectory = UpDate_Path + @"bin\Debug";
                        process1.Start();
                    }

                    this.Close();
                }
            }
        }



        /////////////////////////////////////////　データ検索　//////////////////////////////////////////////////////////////

        private void button15_Click(object sender, EventArgs e)/////////////////////////翌日納品
        {
            dataSet8.DataTable1.Clear();
            DateTime dt = DateTime.Now;
            dt = dt.AddDays(1);
            string N_date = dt.ToString("yyyyMMdd");

            foreach (DataSet6.DataTable1Row abc in dataSet6.DataTable1)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                DateTime dt_t;

                if (abc.顧客名.ToString() != "" && DateTime.TryParse(abc.納品日.ToString(), out dt_t) == true)
                {
                    string T_date = dt_t.ToString("yyyyMMdd");
                    if (N_date == T_date)
                    {
                        N_Row[0] = abc.顧客名.ToString();
                        N_Row[1] = abc.納品日.ToString();
                        N_Row[2] = abc.金額.ToString();
                        N_Row[3] = abc.発注日時.ToString();
                        N_Row[4] = abc._受注No_.ToString();
                        dataSet8.DataTable1.Rows.Add(N_Row);
                    }
                }
            }

            DataTable sort_table = dataSet8.DataTable1.Clone();
            DataView dv = new DataView(dataSet8.DataTable1);
            dv.Sort = "受注No. DESC";
            foreach (DataRowView abc in dv)
            {
                sort_table.ImportRow(abc.Row);
            }

            dataSet8.DataTable1.Clear();
            for (int hh = 0; hh < sort_table.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                {
                    N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                }
                dataSet8.DataTable1.Rows.Add(N_Row);
            }

            label45.Text = dataSet8.DataTable1.Rows.Count.ToString() + " 件";

            dataGridView5.ClearSelection();
            label63.Visible = false;

        }

        private void button10_Click(object sender, EventArgs e)/////////////////////////本日納品
        {
            dataSet8.DataTable1.Clear();
            DateTime dt = DateTime.Now;
            string N_date = dt.ToString("yyyyMMdd");

            foreach (DataSet6.DataTable1Row abc in dataSet6.DataTable1)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                DateTime dt_t;

                if (abc.顧客名.ToString() != "" && DateTime.TryParse(abc.納品日.ToString(), out dt_t) == true)
                {
                    string T_date = dt_t.ToString("yyyyMMdd");
                    if (N_date == T_date)
                    {
                        N_Row[0] = abc.顧客名.ToString();
                        N_Row[1] = abc.納品日.ToString();
                        N_Row[2] = abc.金額.ToString();
                        N_Row[3] = abc.発注日時.ToString();
                        N_Row[4] = abc._受注No_.ToString();
                        dataSet8.DataTable1.Rows.Add(N_Row);
                    }
                }
            }

            DataTable sort_table = dataSet8.DataTable1.Clone();
            DataView dv = new DataView(dataSet8.DataTable1);
            dv.Sort = "受注No. DESC";
            foreach (DataRowView abc in dv)
            {
                sort_table.ImportRow(abc.Row);
            }

            dataSet8.DataTable1.Clear();
            for (int hh = 0; hh < sort_table.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                {
                    N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                }
                dataSet8.DataTable1.Rows.Add(N_Row);
            }

            label45.Text = dataSet8.DataTable1.Rows.Count.ToString() + " 件";

            dataGridView5.ClearSelection();
            label63.Visible = false;

        }

        private void button11_Click(object sender, EventArgs e)/////////////////////////本日受注
        {
            dataSet8.DataTable1.Clear();
            DateTime dt = DateTime.Now;
            string N_date = dt.ToString("yyyyMMdd");

            foreach (DataSet6.DataTable1Row abc in dataSet6.DataTable1)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                DateTime dt_t;

                if (abc.顧客名.ToString() != "" && DateTime.TryParse(abc.発注日時.ToString(), out dt_t) == true)
                {
                    string T_date = dt_t.ToString("yyyyMMdd");
                    if (N_date == T_date)
                    {
                        N_Row[0] = abc.顧客名.ToString();
                        N_Row[1] = abc.納品日.ToString();
                        N_Row[2] = abc.金額.ToString();
                        N_Row[3] = abc.発注日時.ToString();
                        N_Row[4] = abc._受注No_.ToString();
                        dataSet8.DataTable1.Rows.Add(N_Row);
                    }
                }
            }

            DataTable sort_table = dataSet8.DataTable1.Clone();
            DataView dv = new DataView(dataSet8.DataTable1);
            dv.Sort = "受注No. DESC";
            foreach (DataRowView abc in dv)
            {
                sort_table.ImportRow(abc.Row);
            }

            dataSet8.DataTable1.Clear();
            for (int hh = 0; hh < sort_table.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                {
                    N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                }
                dataSet8.DataTable1.Rows.Add(N_Row);
            }

            label45.Text = dataSet8.DataTable1.Rows.Count.ToString() + " 件";
            dataGridView5.ClearSelection();
            label63.Visible = false;
        }

        private void button12_Click(object sender, EventArgs e)/////////////////////////すべて
        {
            dataSet8.DataTable1.Clear();
            data_header();
            label63.Visible = false;
            comboBox3.SelectedIndex = 0;
        }

        private void button13_Click(object sender, EventArgs e)/////////////////////////発注日で検索
        {
            dataSet8.DataTable1.Clear();
            string User = comboBox3.SelectedItem.ToString();
            DateTime dt_1 = dateTimePicker1.Value;
            DateTime dt_2 = dateTimePicker2.Value;
            string s_dt_1 = dt_1.ToString().Substring(0, 10);
            string s_dt_2 = dt_2.ToString().Substring(0, 10);
            dt_1 = DateTime.Parse(s_dt_1);
            dt_2 = DateTime.Parse(s_dt_2);

            if (User == "すべて")
            {
                data_header_hatyu_all(dt_1, dt_2);
            }
            else
            {
                data_header_hatyu(User + "　様", dt_1, dt_2);
            }
            label63.Text = "発注日";
            label63.Visible = true;
        }

        private void button14_Click(object sender, EventArgs e)/////////////////////////納品日で検索
        {
            dataSet8.DataTable1.Clear();
            string User = comboBox3.SelectedItem.ToString();
            DateTime dt_1 = dateTimePicker1.Value;
            DateTime dt_2 = dateTimePicker2.Value;
            string s_dt_1 = dt_1.ToString().Substring(0, 10);
            string s_dt_2 = dt_2.ToString().Substring(0, 10);
            dt_1 = DateTime.Parse(s_dt_1);
            dt_2 = DateTime.Parse(s_dt_2);

            if (User == "すべて")
            {
                data_header_nohin_all(dt_1, dt_2);
            }
            else
            {
                data_header_nohin(User + "　様", dt_1, dt_2);
            }
            label63.Text = "納品日";
            label63.Visible = true;
        }

        private void contextMenuStrip1_Opening(object sender, CancelEventArgs e)
        {
            if (dataGridView5.Rows.GetRowCount(DataGridViewElementStates.Selected) == 0)
            {
                e.Cancel = true;
            }
            else if (dataGridView5.Rows.GetRowCount(DataGridViewElementStates.Selected) == 1)
            {
                toolStripMenuItem1.Enabled = true;
            }
            else
            {
                toolStripMenuItem1.Enabled = false;
            }
        }

        private void toolStripMenuItem1_Click(object sender, EventArgs e)//////////////注文詳細
        {
            if (dataGridView5.Rows.GetRowCount(DataGridViewElementStates.Selected) == 1)
            {
                int pos = 0;
                foreach (DataGridViewRow c in dataGridView5.SelectedRows)
                {
                    pos = c.Index;
                    break;
                }

                string No = dataGridView5[4, pos].Value.ToString();

                Form2 form2 = new Form2(No, dataSet6);
                form2.Show();
            }
        }

        private int Print_Pos;
        private int Print_Count;
        private int Print_Page;

        private void ピッキングリスト印刷ToolStripMenuItem_Click(object sender, EventArgs e)
        {

            foreach (DataGridViewRow abc in dataGridView5.SelectedRows)
            {
                dataSet6.DataTable3.Clear();               

                foreach (DataSet6.DataTable1Row efg in dataSet6.DataTable1)
                {
                    if (abc.Cells[4].Value.ToString() == efg[13].ToString().Substring(0,6))
                    {
                        DataRow NN_Row = dataSet6.DataTable3.NewRow();
                        for (int ii = 0; ii < dataSet6.DataTable1.Columns.Count; ii++)
                        {
                            NN_Row[ii] = efg[ii].ToString();
                        }
                        dataSet6.DataTable3.Rows.Add(NN_Row);

                    }
                }

                foreach (DataSet6.DataTable3Row hhh in dataSet6.DataTable3)
                {
                    foreach (DataSet4.DataTable1Row Item in dataSet4.DataTable1)
                    {
                        if (hhh.商品コード.ToString() == Item.商品コード.ToString())
                        {
                            hhh.適用5 = Item.区分.ToString();
                            break;
                        }
                    }
                }

                DataTable sort_table = dataSet6.DataTable3.Clone();
                DataView dv = new DataView(dataSet6.DataTable3);
                dv.Sort = "適用5";
                foreach (DataRowView D_abc in dv)
                {
                    sort_table.ImportRow(D_abc.Row);
                }

                dataSet6.DataTable3.Clear();
                for (int hh = 0; hh < sort_table.Rows.Count; hh++)
                {
                    DataRow N_Row = dataSet6.DataTable3.NewRow();
                    for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                    {
                        N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                    }
                    dataSet6.DataTable3.Rows.Add(N_Row);
                }

                //printPreviewDialog1.Document = printDocument1;
                //printPreviewDialog1.Width = 1000;
                //printPreviewDialog1.Height = 700;
                //printPreviewDialog1.StartPosition = FormStartPosition.CenterScreen;
                //printPreviewDialog1.ShowDialog();

                printDocument1.Print();

            }        
            
        }

        private void 納品書印刷ToolStripMenuItem_Click(object sender, EventArgs e)
        {
            foreach (DataGridViewRow abc in dataGridView5.SelectedRows)
            {
                dataSet6.DataTable3.Clear();

                foreach (DataSet6.DataTable1Row efg in dataSet6.DataTable1)
                {
                    if (abc.Cells[4].Value.ToString() == efg[13].ToString().Substring(0, 6))
                    {
                        DataRow NN_Row = dataSet6.DataTable3.NewRow();
                        for (int ii = 0; ii < dataSet6.DataTable1.Columns.Count; ii++)
                        {
                            NN_Row[ii] = efg[ii].ToString();
                        }
                        dataSet6.DataTable3.Rows.Add(NN_Row);

                    }
                }


                //printPreviewDialog1.Document = printDocument2;
                //printPreviewDialog1.Width = 1000;
                //printPreviewDialog1.Height = 700;
                //printPreviewDialog1.StartPosition = FormStartPosition.CenterScreen;
                //printPreviewDialog1.ShowDialog();

                printDocument2.Print();
            }
        }

        private void printDocument1_PrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e)//////ピッキングリスト
        {
            int Header = 50;//////////////////////ヘッダー
            int Right = 60;///////////////////////左余白
            int Header_Gyou = 40;//////////////////ヘッダー行間
            int Pitch = 0;/////////////////////////ピッチ
            int Meisai_Width = 700;/////////////////明細幅
            int Meisai_Header = 0;//////////////////明細高さスタート位置
            int Meisai_Height = 0;//////////////////明細高さ
            int Meisai_Pitch = 28;//////////////////明細行数
            int Meisai_Gyou = 30;///////////////////明細行間


            e.Graphics.FillRectangle(new SolidBrush(Color.Black), 270, Header-2, 250, 30);

            e.Graphics.DrawString("ピッキングリスト", new Font("ＭＳ Ｐ明朝", 20), Brushes.White, 300, Header);

            Pitch = Header + 10;
            e.Graphics.DrawString(DateTime.Now.ToString("yyyy/MM/dd  HH:mm"), new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, 620, Pitch);

            Pitch = Header + Header_Gyou + 20;
            e.Graphics.DrawString(dataSet6.DataTable3.Rows[0][0].ToString() + "　　" + dataSet6.DataTable3.Rows[0][1].ToString(),
                new Font("ＭＳ Ｐ明朝", 14), Brushes.Black, Right, Pitch);

            Pitch += Header_Gyou;
            e.Graphics.DrawString("納品日　" + dataSet6.DataTable3.Rows[0][2].ToString(),
                new Font("ＭＳ Ｐ明朝", 14), Brushes.Black, Right, Pitch);

            e.Graphics.DrawString("受注No." + dataSet6.DataTable3.Rows[0][13].ToString(),
               new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 360, Pitch);

            e.Graphics.DrawString("受注日 " + dataSet6.DataTable3.Rows[0][12].ToString(),
                new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 510, Pitch);

            if (dataSet6.DataTable3.Rows.Count > Meisai_Pitch + 2)
            {
                e.Graphics.DrawString(Print_Page + " Page", new Font("ＭＳ Ｐ明朝", 10), Brushes.Black, Right + 645, Pitch + 30);
            }

            Pitch += Header_Gyou + 10;
            Meisai_Header = Pitch;
            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);

            e.Graphics.FillRectangle(new SolidBrush(Color.Silver), Right, Pitch, Meisai_Width, Meisai_Gyou);

            e.Graphics.DrawString("区分", new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 5, Pitch + 7);
            e.Graphics.DrawString("商品コード", new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 60, Pitch + 7);
            e.Graphics.DrawString("商　品　名", new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 260, Pitch + 7);
            e.Graphics.DrawString("受注数", new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 440, Pitch + 7);
            e.Graphics.DrawString("単位", new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 515, Pitch + 7);
            e.Graphics.DrawString("備　考", new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 610, Pitch + 7);



            Pitch += Meisai_Gyou;
            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);
            Meisai_Height += Meisai_Gyou;

            for (int hh = 0; hh < Meisai_Pitch; hh++)
            {
                Pitch += Meisai_Gyou;
                e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);
                Meisai_Height += Meisai_Gyou;

                if (dataSet6.DataTable3.Rows.Count - 2 >= Meisai_Pitch)
                {
                    if (hh + 2 > dataSet6.DataTable3.Rows.Count - Print_Count)
                    {
                        break;
                    }
                }
                else
                {
                    if (hh + 2 > dataSet6.DataTable3.Rows.Count - Print_Count - 2)
                    {
                        break;
                    }
                }
            }

            e.Graphics.DrawLine(new Pen(Color.Black), Right, Meisai_Header, Right, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 50, Meisai_Header, Right + 50, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 160, Meisai_Header, Right + 160, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 430, Meisai_Header, Right + 430, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 500, Meisai_Header, Right + 500, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 570, Meisai_Header, Right + 570, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + Meisai_Width, Meisai_Header, Right + Meisai_Width, Meisai_Header + Meisai_Height);

            Pitch = Meisai_Header + Meisai_Gyou + 7;

            for (int hh = Print_Count; hh < dataSet6.DataTable3.Rows.Count; hh++)
            {
                if (hh == 0 || hh == 1)
                {
                    Print_Count++;
                }
                if (dataSet6.DataTable3.Rows[hh][1].ToString() == "" && dataSet6.DataTable3.Rows[hh][3].ToString() != "")
                {
                    e.Graphics.DrawString(dataSet6.DataTable3.Rows[hh][18].ToString(), new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 15, Pitch);

                    e.Graphics.DrawString(dataSet6.DataTable3.Rows[hh][3].ToString(), new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 75, Pitch);

                    e.Graphics.DrawString(dataSet6.DataTable3.Rows[hh][4].ToString(), new Font("ＭＳ Ｐ明朝", 12), Brushes.Black, Right + 165, Pitch);

                    e.Graphics.DrawString(dataSet6.DataTable3.Rows[hh][10].ToString(), new Font("ＭＳ Ｐ明朝", 12), Brushes.Black,
                        (Right + 490) - e.Graphics.MeasureString(dataSet6.DataTable3.Rows[hh][10].ToString(), new Font("ＭＳ Ｐ明朝", 12)).Width, Pitch);

                    e.Graphics.DrawString(dataSet6.DataTable3.Rows[hh][9].ToString(), new Font("ＭＳ Ｐ明朝", 12), Brushes.Black,
                        (Right + 550) - e.Graphics.MeasureString(dataSet6.DataTable3.Rows[hh][9].ToString(), new Font("ＭＳ Ｐ明朝", 12)).Width, Pitch);

                    Print_Pos++;
                    Print_Count++;
                    Pitch += Meisai_Gyou;

                    if (Print_Pos >= Meisai_Pitch)
                    {
                        break;
                    }
                }
                
            }

            if (Print_Pos >= Meisai_Pitch)
            {
                e.HasMorePages = true;
                Print_Pos = 0;
                Print_Page++;
            }
            if (Print_Count == dataSet6.DataTable3.Rows.Count)
            {
                e.HasMorePages = false;
            }





        }
       
        private void printDocument1_BeginPrint(object sender, System.Drawing.Printing.PrintEventArgs e)
        {
            Print_Pos = 0;           
            Print_Count = 0;
            Print_Page = 1;
        }

        private void printDocument2_PrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e)//////納品書
        {
            int Header = 50;//////////////////////ヘッダー
            int Right = 60;///////////////////////左余白
            int Header_Gyou = 20;//////////////////ヘッダー行間
            int Pitch = 0;/////////////////////////ピッチ
            int Meisai_Width = 700;/////////////////明細幅
            int Meisai_Header = 0;//////////////////明細高さスタート位置
            int Meisai_Height = 0;//////////////////明細高さ
            int Meisai_Pitch = 25;//////////////////明細行数
            int Meisai_Gyou = 30;///////////////////明細行間

            string J_1 = "";
            string J_2 = "";
            string J_3 = "";

            foreach (DataSet1.DataTable1Row abc in dataSet1.DataTable1)
            {
                if (dataSet6.DataTable3.Rows[0][0].ToString() == abc[0].ToString())
                {
                    J_1 = abc[5].ToString();
                    J_2 = abc[6].ToString();
                    J_3 = abc[7].ToString();
                    break;
                }

            }

            e.Graphics.DrawString("納　品　書", new Font("ＭＳ Ｐ明朝", 22), Brushes.Black, 300, Header);


            Pitch = Header + Header_Gyou + 20;
            int R_Pitch = Pitch;
            e.Graphics.DrawString(dataSet6.DataTable3.Rows[0][1].ToString(), new Font("ＭＳ Ｐ明朝", 15, FontStyle.Bold), Brushes.Black, Right, Pitch);
            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch + Header_Gyou,
              Right + e.Graphics.MeasureString(dataSet6.DataTable3.Rows[0][1].ToString(), new Font("ＭＳ Ｐ明朝", 15, FontStyle.Bold)).Width, Pitch + Header_Gyou);

            R_Pitch += 15;
            string J_Yubin = dataSet13.DataTable1.Rows[0][0].ToString();
            if (J_Yubin != "")
            {
                J_Yubin = "〒" + J_Yubin;
            }
            e.Graphics.DrawString(dataSet13.DataTable1.Rows[0][1].ToString(), new Font("ＭＳ Ｐ明朝", 14), Brushes.Black, Right + 440, R_Pitch);
            R_Pitch += Header_Gyou + 5;

            e.Graphics.DrawString(J_Yubin, new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 440, R_Pitch);
            R_Pitch += Header_Gyou;

            e.Graphics.DrawString(dataSet13.DataTable1.Rows[0][2].ToString(), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 440, R_Pitch);
            R_Pitch += Header_Gyou;

            e.Graphics.DrawString(dataSet13.DataTable1.Rows[0][3].ToString(), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 440, R_Pitch);
            R_Pitch += Header_Gyou;

            e.Graphics.DrawString(dataSet13.DataTable1.Rows[0][4].ToString(), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 440, R_Pitch);

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
            e.Graphics.DrawString("納品日 " + dataSet6.DataTable3.Rows[0][2].ToString(),
                new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right, Pitch);
            Pitch += Header_Gyou;
            e.Graphics.DrawString("下記の通り納品致しました", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right, Pitch);

            e.Graphics.DrawString("受注No." + dataSet6.DataTable3.Rows[0][13].ToString(),
              new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 590, Pitch);


            Pitch += Header_Gyou + 5;
            Meisai_Header = Pitch;

            e.Graphics.FillRectangle(new SolidBrush(Color.Silver), Right, Pitch, Meisai_Width, Meisai_Gyou);

            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);
            
            e.Graphics.DrawString("区分", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 5, Pitch + 7);
            e.Graphics.DrawString("商　品　名", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 150, Pitch + 7);
            e.Graphics.DrawString("数量", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 340, Pitch + 7);
            e.Graphics.DrawString("単位", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 395, Pitch + 7);
            e.Graphics.DrawString("単価", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 460, Pitch + 7);
            e.Graphics.DrawString("金 額", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 545, Pitch + 7);
            e.Graphics.DrawString("摘 要", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 635, Pitch + 7);



            Pitch += Meisai_Gyou;
            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);
            Meisai_Height += Meisai_Gyou;

            for (int hh = 0; hh < Meisai_Pitch; hh++)
            {
                Pitch += Meisai_Gyou;
                e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);
                Meisai_Height += Meisai_Gyou;
            }

            e.Graphics.FillRectangle(new SolidBrush(Color.Silver), Right + 390, Pitch+1, 130, 74);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 390, Pitch + 25, Right + Meisai_Width, Pitch + 25);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 390, Pitch + 50, Right + Meisai_Width, Pitch + 50);

            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch + 75, Right + Meisai_Width, Pitch + 75);


            e.Graphics.DrawLine(new Pen(Color.Black), Right, Meisai_Header, Right, Meisai_Header + Meisai_Height + 75);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 45, Meisai_Header, Right + 45, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 330, Meisai_Header, Right + 330, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 390, Meisai_Header, Right + 390, Meisai_Header + Meisai_Height + 75);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 440, Meisai_Header, Right + 440, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 520, Meisai_Header, Right + 520, Meisai_Header + Meisai_Height + 75);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 610, Meisai_Header, Right + 610, Meisai_Header + Meisai_Height + 75);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + Meisai_Width, Meisai_Header, Right + Meisai_Width, Meisai_Header + Meisai_Height + 75);

            e.Graphics.DrawString("備 考", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 5, Pitch + 5);
            e.Graphics.DrawString("金額計", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 430, Pitch + 5);
            e.Graphics.DrawString("消費税", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 430, Pitch + 30);
            e.Graphics.DrawString("合　計", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 430, Pitch + 55);


            Pitch = Meisai_Header + Meisai_Gyou + 7;

            int Total = 0;
            for (int hh = Print_Count; hh < dataSet6.DataTable3.Rows.Count - 1; hh++)
            {
                if (hh == 0)
                {
                    Print_Count++;
                }
               
                if (dataSet6.DataTable3.Rows[hh][1].ToString() == "" && dataSet6.DataTable3.Rows[hh][3].ToString() != "")
                {
                    string kubun = "";
                    foreach (DataSet4.DataTable1Row abc in dataSet4.DataTable1)
                    {
                        if (dataSet6.DataTable3.Rows[hh][3].ToString() == abc[0].ToString())
                        {
                            kubun = abc[4].ToString();
                            break;
                        }
                    }

                    e.Graphics.DrawString(kubun, new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 15, Pitch);

                    e.Graphics.DrawString(dataSet6.DataTable3.Rows[hh][3].ToString(), new Font("ＭＳ Ｐ明朝", 9), Brushes.Black, Right + 48, Pitch - 5);

                    e.Graphics.DrawString(dataSet6.DataTable3.Rows[hh][4].ToString(), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 48, Pitch + 7);

                    if (dataSet6.DataTable3.Rows[hh][10].ToString() == "")
                    {
                        dataSet6.DataTable3.Rows[hh][10] = "0";
                    }
                    double Suu = double.Parse(dataSet6.DataTable3.Rows[hh][10].ToString());
                    e.Graphics.DrawString(Suu.ToString(), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black,
                        (Right + 380) - e.Graphics.MeasureString(Suu.ToString(), new Font("ＭＳ Ｐ明朝", 11)).Width, Pitch);

                    e.Graphics.DrawString(dataSet6.DataTable3.Rows[hh][9].ToString(), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black,
                        (Right + 430) - e.Graphics.MeasureString(dataSet6.DataTable3.Rows[hh][9].ToString(), new Font("ＭＳ Ｐ明朝", 11)).Width, Pitch);

                    if (dataSet6.DataTable3.Rows[hh][7].ToString() == "")
                    {
                        dataSet6.DataTable3.Rows[hh][7] = "0";
                    }
                    int Tanka = int.Parse(dataSet6.DataTable3.Rows[hh][7].ToString());
                   
                    e.Graphics.DrawString(Tanka.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black,
                        (Right + 510) - e.Graphics.MeasureString(Tanka.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11)).Width, Pitch);


                    if (dataSet6.DataTable3.Rows[hh][11].ToString() == "")
                    {
                        dataSet6.DataTable3.Rows[hh][11] = "0";
                    }
                    e.Graphics.DrawString(dataSet6.DataTable3.Rows[hh][11].ToString(), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black,
                        (Right + 610) - e.Graphics.MeasureString(dataSet6.DataTable3.Rows[hh][11].ToString(), new Font("ＭＳ Ｐ明朝", 11)).Width, Pitch);

                    
                    int Kingaku = int.Parse(dataSet6.DataTable3.Rows[hh][11].ToString().Replace(",", ""));
                    Total += Kingaku;

                    Print_Pos++;
                    Print_Count++;
                    Pitch += Meisai_Gyou;

                    if (Print_Pos >= Meisai_Pitch)
                    {
                        break;
                    }
                }

            }

            string Zei = "";
            foreach (DataSet1.DataTable1Row abc in dataSet1.DataTable1)
            {
                if (dataSet6.DataTable3.Rows[0][0].ToString() == abc[0].ToString())
                {
                    Zei = abc[13].ToString();
                    break;
                }
            }

            if (Zei == "税抜")
            {
                e.Graphics.DrawString(Total.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black,
                            (Right + 610) - e.Graphics.MeasureString(Total.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11)).Width, 245 + Meisai_Height + 5);

                
                int TT = Total * int.Parse(dataSet13.DataTable2.Rows[0][0].ToString());
                double Tax = (double)TT / (double)100;               
                double IntTax = Math.Ceiling(Tax);

                e.Graphics.DrawString(IntTax.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black,
                            (Right + 610) - e.Graphics.MeasureString(IntTax.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11)).Width, 245 + Meisai_Height + 30);

                int Total_Price = Total + (int)IntTax;

                e.Graphics.DrawString(Total_Price.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black,
                           (Right + 610) - e.Graphics.MeasureString(Total_Price.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11)).Width, 245 + Meisai_Height + 54);

            }
            else
            {
                // e.Graphics.DrawString(Total.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black,
                //          (Right + 610) - e.Graphics.MeasureString(Total.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11)).Width, 245 + Meisai_Height + 5);

                // int Tax = Total * int.Parse(dataSet13.DataTable2.Rows[0][0].ToString()) / 100;

                e.Graphics.DrawString("税 込", new Font("ＭＳ Ｐ明朝", 11), Brushes.Black, Right + 570, 245 + Meisai_Height + 30);

               // int Total_Price = Total + Tax;

                e.Graphics.DrawString(Total.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11), Brushes.Black,
                           (Right + 610) - e.Graphics.MeasureString(Total.ToString("n0"), new Font("ＭＳ Ｐ明朝", 11)).Width, 245 + Meisai_Height + 54);

            }

            if (Print_Pos >= Meisai_Pitch)
            {
                e.HasMorePages = true;
                Print_Pos = 0;
                Print_Page++;
            }
            if (Print_Count == dataSet6.DataTable3.Rows.Count-1)
            {
                e.HasMorePages = false;
            }
            




        }

        private void printDocument2_BeginPrint(object sender, System.Drawing.Printing.PrintEventArgs e)
        {
            Print_Pos = 0;
            Print_Count = 0;
            Print_Page = 1;
        }

        private void dataGridView5_DoubleClick(object sender, EventArgs e)
        {
            if (dataGridView5.Rows.GetRowCount(DataGridViewElementStates.Selected) == 1)
            {
                int pos = 0;
                foreach (DataGridViewRow c in dataGridView5.SelectedRows)
                {
                    pos = c.Index;
                    break;
                }

                string No = dataGridView5[4, pos].Value.ToString();

                Form2 form2 = new Form2(No, dataSet6);
                form2.Show();
            }


        }

        private void combo3_add()
        {
            comboBox3.Items.Clear();
            comboBox3.Items.Add("すべて");
            foreach (DataSet1.DataTable1Row abc in dataSet1.DataTable1)
            {
                comboBox3.Items.Add(abc.顧客名.ToString());
            }
            comboBox3.SelectedIndex = 0;
        }

        private void comboBox3_SelectedIndexChanged(object sender, EventArgs e)
        {
            dataSet8.DataTable1.Clear();
            string User = comboBox3.SelectedItem.ToString();
            DateTime dt_1 = dateTimePicker1.Value;
            DateTime dt_2 = dateTimePicker2.Value;
            if (label63.Visible == false)
            {
                if (User == "すべて")
                {
                    data_header();
                }
                else
                {
                    data_header_Name(User + "　様");
                }
            }
            else if (label63.Text == "発注日")
            {
                if (User == "すべて")
                {
                    data_header_hatyu_all(dt_1, dt_2);
                }
                else
                {
                    data_header_hatyu(User + "　様", dt_1, dt_2);
                }
            }
            else if (label63.Text == "納品日")
            {
                if (User == "すべて")
                {
                    data_header_nohin_all(dt_1, dt_2);
                }
                else
                {
                    data_header_nohin(User + "　様", dt_1, dt_2);
                }
            }

        }

        private void dateTimePicker1_ValueChanged(object sender, EventArgs e)
        {
            dateTimePicker1.MaxDate = dateTimePicker2.Value;
            dateTimePicker2.MinDate = dateTimePicker1.Value;
        }

        private void dateTimePicker2_ValueChanged(object sender, EventArgs e)
        {
            dateTimePicker1.MaxDate = dateTimePicker2.Value;
            dateTimePicker2.MinDate = dateTimePicker1.Value;
        }

        private void data_header()
        {
           
            foreach (DataSet6.DataTable1Row abc in dataSet6.DataTable1)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();

                if (abc.顧客名.ToString() != "")
                {
                    N_Row[0] = abc.顧客名.ToString();
                    N_Row[1] = abc.納品日.ToString();
                    N_Row[2] = abc.金額.ToString();
                    N_Row[3] = abc.発注日時.ToString();
                    N_Row[4] = abc._受注No_.ToString();
                    N_Row[5] = abc.適用1.ToString();
                    dataSet8.DataTable1.Rows.Add(N_Row);
                }
            }

            DataTable sort_table = dataSet8.DataTable1.Clone();
            DataView dv = new DataView(dataSet8.DataTable1);
            dv.Sort = "受注No. DESC";
            foreach (DataRowView abc in dv)
            {
                sort_table.ImportRow(abc.Row);
            }

            dataSet8.DataTable1.Clear();
            for (int hh = 0; hh < sort_table.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                {
                    N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                }
                dataSet8.DataTable1.Rows.Add(N_Row);
            }


            label45.Text = dataSet8.DataTable1.Rows.Count.ToString() + " 件";
            dataGridView5.ClearSelection();
        }

        private void data_header_Name(string User)
        {
            foreach (DataSet6.DataTable1Row abc in dataSet6.DataTable1)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();

                if (abc.顧客名.ToString() != "")
                {
                    if (User == abc.顧客名.ToString())
                    {
                        N_Row[0] = abc.顧客名.ToString();
                        N_Row[1] = abc.納品日.ToString();
                        N_Row[2] = abc.金額.ToString();
                        N_Row[3] = abc.発注日時.ToString();
                        N_Row[4] = abc._受注No_.ToString();
                        dataSet8.DataTable1.Rows.Add(N_Row);
                    }
                }
            }

            DataTable sort_table = dataSet8.DataTable1.Clone();
            DataView dv = new DataView(dataSet8.DataTable1);
            dv.Sort = "受注No. DESC";
            foreach (DataRowView abc in dv)
            {
                sort_table.ImportRow(abc.Row);
            }

            dataSet8.DataTable1.Clear();
            for (int hh = 0; hh < sort_table.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                {
                    N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                }
                dataSet8.DataTable1.Rows.Add(N_Row);
            }

            label45.Text = dataSet8.DataTable1.Rows.Count.ToString() + " 件";
            dataGridView5.ClearSelection();
        }

        private void data_header_hatyu_all(DateTime dt_1, DateTime dt_2)
        {
            foreach (DataSet6.DataTable1Row abc in dataSet6.DataTable1)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();

                string N_date = abc.発注日時.Substring(0, 10);
                DateTime N_dt = DateTime.Parse(N_date);

                if (abc.顧客名.ToString() != "")
                {
                    if (dt_1 <= N_dt && N_dt <= dt_2)
                    {
                        N_Row[0] = abc.顧客名.ToString();
                        N_Row[1] = abc.納品日.ToString();
                        N_Row[2] = abc.金額.ToString();
                        N_Row[3] = abc.発注日時.ToString();
                        N_Row[4] = abc._受注No_.ToString();
                        dataSet8.DataTable1.Rows.Add(N_Row);
                    }
                }
            }

            DataTable sort_table = dataSet8.DataTable1.Clone();
            DataView dv = new DataView(dataSet8.DataTable1);
            dv.Sort = "受注No. DESC";
            foreach (DataRowView abc in dv)
            {
                sort_table.ImportRow(abc.Row);
            }

            dataSet8.DataTable1.Clear();
            for (int hh = 0; hh < sort_table.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                {
                    N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                }
                dataSet8.DataTable1.Rows.Add(N_Row);
            }

            label45.Text = dataSet8.DataTable1.Rows.Count.ToString() + " 件";
            dataGridView5.ClearSelection();
        }

        private void data_header_hatyu(string User, DateTime dt_1, DateTime dt_2)
        {
            foreach (DataSet6.DataTable1Row abc in dataSet6.DataTable1)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();

                string N_date = abc.発注日時.Substring(0, 10);
                DateTime N_dt = DateTime.Parse(N_date);

                if (abc.顧客名.ToString() != "")
                {
                    if (User == abc.顧客名.ToString() && dt_1 <= N_dt && N_dt <= dt_2)
                    {
                        N_Row[0] = abc.顧客名.ToString();
                        N_Row[1] = abc.納品日.ToString();
                        N_Row[2] = abc.金額.ToString();
                        N_Row[3] = abc.発注日時.ToString();
                        N_Row[4] = abc._受注No_.ToString();
                        dataSet8.DataTable1.Rows.Add(N_Row);
                    }
                }
            }

            DataTable sort_table = dataSet8.DataTable1.Clone();
            DataView dv = new DataView(dataSet8.DataTable1);
            dv.Sort = "受注No. DESC";
            foreach (DataRowView abc in dv)
            {
                sort_table.ImportRow(abc.Row);
            }

            dataSet8.DataTable1.Clear();
            for (int hh = 0; hh < sort_table.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                {
                    N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                }
                dataSet8.DataTable1.Rows.Add(N_Row);
            }

            label45.Text = dataSet8.DataTable1.Rows.Count.ToString() + " 件";
            dataGridView5.ClearSelection();
        }

        private void data_header_nohin_all(DateTime dt_1, DateTime dt_2)
        {
            foreach (DataSet6.DataTable1Row abc in dataSet6.DataTable1)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();

                DateTime N_dt = DateTime.Parse(abc.納品日.ToString());

                if (abc.顧客名.ToString() != "")
                {
                    if (dt_1 <= N_dt && N_dt <= dt_2)
                    {
                        N_Row[0] = abc.顧客名.ToString();
                        N_Row[1] = abc.納品日.ToString();
                        N_Row[2] = abc.金額.ToString();
                        N_Row[3] = abc.発注日時.ToString();
                        N_Row[4] = abc._受注No_.ToString();
                        dataSet8.DataTable1.Rows.Add(N_Row);
                    }
                }
            }

            DataTable sort_table = dataSet8.DataTable1.Clone();
            DataView dv = new DataView(dataSet8.DataTable1);
            dv.Sort = "受注No. DESC";
            foreach (DataRowView abc in dv)
            {
                sort_table.ImportRow(abc.Row);
            }

            dataSet8.DataTable1.Clear();
            for (int hh = 0; hh < sort_table.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                {
                    N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                }
                dataSet8.DataTable1.Rows.Add(N_Row);
            }

            label45.Text = dataSet8.DataTable1.Rows.Count.ToString() + " 件";
            dataGridView5.ClearSelection();
        }

        private void data_header_nohin(string User, DateTime dt_1, DateTime dt_2)
        {
            foreach (DataSet6.DataTable1Row abc in dataSet6.DataTable1)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();

                DateTime N_dt = DateTime.Parse(abc.納品日.ToString());

                if (abc.顧客名.ToString() != "")
                {
                    if (User == abc.顧客名.ToString() && dt_1 <= N_dt && N_dt <= dt_2)
                    {
                        N_Row[0] = abc.顧客名.ToString();
                        N_Row[1] = abc.納品日.ToString();
                        N_Row[2] = abc.金額.ToString();
                        N_Row[3] = abc.発注日時.ToString();
                        N_Row[4] = abc._受注No_.ToString();
                        dataSet8.DataTable1.Rows.Add(N_Row);
                    }
                }
            }

            DataTable sort_table = dataSet8.DataTable1.Clone();
            DataView dv = new DataView(dataSet8.DataTable1);
            dv.Sort = "受注No. DESC";
            foreach (DataRowView abc in dv)
            {
                sort_table.ImportRow(abc.Row);
            }

            dataSet8.DataTable1.Clear();
            for (int hh = 0; hh < sort_table.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet8.DataTable1.NewRow();
                for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                {
                    N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                }
                dataSet8.DataTable1.Rows.Add(N_Row);
            }

            label45.Text = dataSet8.DataTable1.Rows.Count.ToString() + " 件";
            dataGridView5.ClearSelection();
        }



        ///////////////////////////////////////　見積書　//////////////////////////////////////////////////////////

        private void listBox1_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (listBox1.SelectedIndex != -1)
            {
                listBox2.Items.Clear();
                dataSet3.DataTable2.Clear();

                string F_Name = listBox1.SelectedItem.ToString();
                F_Name = "A_Date_" + F_Name + ".xml";
                F_Name = Group_pass + F_Name;
                if (System.IO.File.Exists(F_Name) == true)
                {
                    dataSet3.DataTable2.ReadXml(F_Name);
                    if (dataSet3.DataTable2.Rows.Count > 0)
                    {
                        foreach (DataSet3.DataTable2Row abc in dataSet3.DataTable2.Rows)
                        {
                            listBox2.Items.Add(abc[0].ToString());
                        }
                    }
                }


                dataSet3.DataTable1.Clear();
                F_Name = listBox1.SelectedItem.ToString() + ".xml";
                F_Name = Group_pass + F_Name;
                if (System.IO.File.Exists(F_Name) == true)
                {
                    dataSet3.DataTable1.ReadXml(F_Name);

                }

                Group_Text_Close();

            }
        }

        private void dataGridView2_CellClick(object sender, DataGridViewCellEventArgs e)
        {
            if (dataGridView2.Rows.Count > 0)
            {
                if (dataGridView2.Rows.GetRowCount(DataGridViewElementStates.Selected) == 1)
                {
                    Select_Group();
                    Group_Text_Open();
                }
            }
        }

        private void contextMenuStrip2_Opening(object sender, CancelEventArgs e)
        {
            if (listBox1.SelectedIndex == -1)
            {
                e.Cancel = true;
            }
        }

        private void toolStripMenuItem3_Click(object sender, EventArgs e)//////////////////見積書印刷//////////
        {

            if (listBox1.SelectedIndex != -1)
            {
                string F_Name = listBox1.SelectedItem.ToString();
                F_Name = "A_Date_" + F_Name + ".xml";
                F_Name = Group_pass + F_Name;
                if (System.IO.File.Exists(F_Name) == true)
                {

                    Form6 form6 = new Form6(dataSet1.DataTable1, dataSet3.DataTable2, listBox1.SelectedItem.ToString(),
                        dataSet13.DataTable2.Rows[0][1].ToString(), dataSet13.DataTable2.Rows[0][2].ToString());
                    DialogResult ret = form6.ShowDialog();
                    if (ret == DialogResult.OK)
                    {
                        if (ret == DialogResult.OK)
                        {
                            dataSet13.DataTable2.Rows[0][1] = form6.textBox1.Text;
                            dataSet13.DataTable2.Rows[0][2] = form6.textBox2.Text;
                            savedata_10();
                            Mitumori_User = form6.comboBox1.SelectedItem.ToString().Remove(0, 7);
                            User_No = form6.comboBox1.SelectedItem.ToString().Substring(0, 6);

                            dataSet3.DataTable2.Clear();
                            dataSet3.DataTable2.ReadXml(F_Name);

                            //printPreviewDialog1.Document = printDocument4;
                            //printPreviewDialog1.Width = 1000;
                            //printPreviewDialog1.Height = 700;
                            //printPreviewDialog1.StartPosition = FormStartPosition.CenterScreen;
                            //printPreviewDialog1.ShowDialog();

                            printDocument4.Print();
                        }

                    }

                }
            }
               
        }

        private string Mitumori_User = "";
        private string User_No = "";

        private void printDocument4_PrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e)
        {
            int Header = 40;//////////////////////ヘッダー
            int Right = 20;///////////////////////左余白
            int Header_Gyou = 20;//////////////////ヘッダー行間
            int Pitch = 0;/////////////////////////ピッチ
            int Meisai_Width = 370;/////////////////明細幅
            int Meisai_Header = 0;//////////////////明細高さスタート位置
            int Meisai_Height = 0;//////////////////明細高さ
            int Meisai_Pitch = 30;//////////////////明細行数
            int Meisai_Gyou = 28;///////////////////明細行間
            int Meisai_Pitch_Right = 30;/////////////右明細行数

            string English = "";
            foreach (DataSet1.DataTable1Row abc in dataSet1.DataTable1)
            {
                if (User_No == abc[0].ToString())
                {
                    if (abc.英語表記.ToString() == "英語")
                    {
                        English = "True";
                        break;
                    }
                }
            }           

            e.Graphics.DrawString("青果物お見積書 兼 注文書", new Font("ＭＳ Ｐゴシック", 16), Brushes.Black, 270, Header);

            Pitch = Header + Header_Gyou + 10;
            e.Graphics.DrawString(Mitumori_User + "　様", new Font("ＭＳ Ｐゴシック", 16), Brushes.Black, Right, Pitch);
            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch + 25,
              Right + e.Graphics.MeasureString(Mitumori_User + "　様", new Font("ＭＳ Ｐゴシック", 16)).Width, Pitch + 25);

            string Nouhinbi = "";
            DateTime DT_1;
            DateTime DT_2;
            DateTime DT_3;
            if (dataSet3.DataTable2.Rows.Count == 1)
            {
               
                if (DateTime.TryParse(dataSet3.DataTable2.Rows[0][0].ToString(), out DT_1) == true)
                {
                    Nouhinbi = "納品日　" + DT_1.ToString("M月d日");
                }

            }
            else if (dataSet3.DataTable2.Rows.Count == 2)
            {              
                
                if (DateTime.TryParse(dataSet3.DataTable2.Rows[0][0].ToString(), out DT_2) == true &&
                    DateTime.TryParse(dataSet3.DataTable2.Rows[1][0].ToString(), out DT_3) == true)
                {
                    Nouhinbi = "納品日　" + DT_2.ToString("M月d日(ddd)") + "　" + DT_3.ToString("M月d日(ddd)");
                }

            }
            e.Graphics.DrawString(Nouhinbi, new Font("ＭＳ Ｐゴシック", 13), Brushes.Black, Right, Pitch + 45);

            Pitch += 10;
            e.Graphics.DrawString("株式会社　ナンキ", new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 560, Pitch -= Header_Gyou);
            Pitch += Header_Gyou + 5;
            e.Graphics.DrawString("FAX : 045-633-1946", new Font("ＭＳ Ｐゴシック", 15), Brushes.Black, Right + 560, Pitch - 3);
            Pitch += Header_Gyou;
            e.Graphics.DrawString("TEL : 045-633-1927", new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 560, Pitch);

            Pitch += Header_Gyou;

            string Tantou = "担当　" + dataSet13.DataTable2.Rows[0][1].ToString() + " : " + dataSet13.DataTable2.Rows[0][2].ToString();
            e.Graphics.DrawString(Tantou, new Font("ＭＳ Ｐゴシック", 12), Brushes.Black,
                (Right + 721) - e.Graphics.MeasureString(Tantou, new Font("ＭＳ Ｐゴシック", 12)).Width, Pitch);

            Pitch += Header_Gyou + 10;


            Meisai_Header = Pitch;
            Meisai_Height += Meisai_Gyou;

            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);

            e.Graphics.DrawString("商 品 名", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 55, Pitch + 7);
            e.Graphics.DrawString("規格", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 155, Pitch + 7);
            e.Graphics.DrawString("単位", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 200, Pitch + 7);
            e.Graphics.DrawString("商品", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 253, Pitch + 7);
            e.Graphics.DrawString("単価", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 253, Pitch + 7 + 17);
            e.Graphics.DrawString("ご注文欄", new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right + 306, Pitch + 7);

            if (dataSet3.DataTable2.Rows.Count == 1)
            {
                if (DateTime.TryParse(dataSet3.DataTable2.Rows[0][0].ToString(), out DT_1) == true)
                {
                    Nouhinbi = DT_1.ToString("d日");
                    e.Graphics.DrawString(Nouhinbi, new Font("ＭＳ Ｐゴシック", 10), Brushes.Black,
                        (Right + 335) - e.Graphics.MeasureString(Nouhinbi, new Font("ＭＳ Ｐゴシック", 10)).Width, Pitch + 8 + Meisai_Gyou);

                }
            }
            else if (dataSet3.DataTable2.Rows.Count == 2)
            {
                if (DateTime.TryParse(dataSet3.DataTable2.Rows[0][0].ToString(), out DT_2) == true &&
                    DateTime.TryParse(dataSet3.DataTable2.Rows[1][0].ToString(), out DT_3) == true)
                {
                    Nouhinbi = DT_2.ToString("d日");
                    string N_2= DT_3.ToString("d日");

                    e.Graphics.DrawString(Nouhinbi, new Font("ＭＳ Ｐゴシック", 10), Brushes.Black,
                       (Right + 335) - e.Graphics.MeasureString(Nouhinbi, new Font("ＭＳ Ｐゴシック", 10)).Width, Pitch + 8 + Meisai_Gyou);

                    e.Graphics.DrawString(N_2, new Font("ＭＳ Ｐゴシック", 10), Brushes.Black,
                       (Right + 371) - e.Graphics.MeasureString(N_2, new Font("ＭＳ Ｐゴシック", 10)).Width, Pitch + 8 + Meisai_Gyou);

                }
            }

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 300, Pitch + Meisai_Gyou, Right + Meisai_Width, Pitch + Meisai_Gyou);

            Pitch += Meisai_Gyou;

            for (int hh = 0; hh < Meisai_Pitch + 1; hh++)
            {
                Pitch += Meisai_Gyou;
                e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);
                Meisai_Height += Meisai_Gyou;
            }

            e.Graphics.DrawLine(new Pen(Color.Black), Right, Meisai_Header, Right, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 20, Meisai_Header, Right + 20, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 150, Meisai_Header, Right + 150, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 195, Meisai_Header, Right + 195, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 240, Meisai_Header, Right + 240, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 300, Meisai_Header, Right + 300, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 335, Meisai_Header + Meisai_Gyou, Right + 335, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + Meisai_Width, Meisai_Header, Right + Meisai_Width, Meisai_Header + Meisai_Height);


            Pitch = Meisai_Header;
            int Right_R = Right + 390;
            Meisai_Height = 0;

            Meisai_Height += Meisai_Gyou;
            e.Graphics.DrawLine(new Pen(Color.Black), Right_R, Pitch, Right_R + Meisai_Width, Pitch);

            e.Graphics.DrawString("商 品 名", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 55, Pitch + 7);
            e.Graphics.DrawString("規格", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 155, Pitch + 7);
            e.Graphics.DrawString("単位", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 200, Pitch + 7);
            e.Graphics.DrawString("商品", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 253, Pitch + 7);
            e.Graphics.DrawString("単価", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 253, Pitch + 7 + 17);
            e.Graphics.DrawString("ご注文欄", new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right_R + 308, Pitch + 7);

            if (dataSet3.DataTable2.Rows.Count == 1)
            {
                if (DateTime.TryParse(dataSet3.DataTable2.Rows[0][0].ToString(), out DT_1) == true)
                {
                    Nouhinbi = DT_1.ToString("d日");
                    e.Graphics.DrawString(Nouhinbi, new Font("ＭＳ Ｐゴシック", 10), Brushes.Black,
                        (Right_R + 335) - e.Graphics.MeasureString(Nouhinbi, new Font("ＭＳ Ｐゴシック", 10)).Width, Pitch + 8 + Meisai_Gyou);

                }
            }
            else if (dataSet3.DataTable2.Rows.Count == 2)
            {
                if (DateTime.TryParse(dataSet3.DataTable2.Rows[0][0].ToString(), out DT_2) == true &&
                    DateTime.TryParse(dataSet3.DataTable2.Rows[1][0].ToString(), out DT_3) == true)
                {
                    Nouhinbi = DT_2.ToString("d日");
                    string N_2 = DT_3.ToString("d日");

                    e.Graphics.DrawString(Nouhinbi, new Font("ＭＳ Ｐゴシック", 10), Brushes.Black,
                       (Right_R + 335) - e.Graphics.MeasureString(Nouhinbi, new Font("ＭＳ Ｐゴシック", 10)).Width, Pitch + 8 + Meisai_Gyou);

                    e.Graphics.DrawString(N_2, new Font("ＭＳ Ｐゴシック", 10), Brushes.Black,
                       (Right_R + 371) - e.Graphics.MeasureString(N_2, new Font("ＭＳ Ｐゴシック", 10)).Width, Pitch + 8 + Meisai_Gyou);

                }
            }

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + 300, Pitch + Meisai_Gyou, Right_R + Meisai_Width, Pitch + Meisai_Gyou);

            Pitch += Meisai_Gyou;

            for (int hh = 0; hh < Meisai_Pitch_Right + 1; hh++)
            {
                Pitch += Meisai_Gyou;
                e.Graphics.DrawLine(new Pen(Color.Black), Right_R, Pitch, Right_R + Meisai_Width, Pitch);
                Meisai_Height += Meisai_Gyou;
            }

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R, Meisai_Header, Right_R, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + 20, Meisai_Header, Right_R + 20, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + 150, Meisai_Header, Right_R + 150, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + 195, Meisai_Header, Right_R + 195, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + 240, Meisai_Header, Right_R + 240, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + 300, Meisai_Header, Right_R + 300, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + 335, Meisai_Header + Meisai_Gyou, Right_R + 335, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + Meisai_Width, Meisai_Header, Right_R + Meisai_Width, Meisai_Header + Meisai_Height);


           

            int Left_pitch = Meisai_Header + ((Meisai_Gyou + 2) * Meisai_Pitch);

           // e.Graphics.DrawLine(new Pen(Color.Black), Right_R, Meisai_Header + Meisai_Height, Right_R, Left_pitch);

           // e.Graphics.DrawLine(new Pen(Color.Black), Right_R, Left_pitch, Right_R + Meisai_Width, Left_pitch);

           // e.Graphics.DrawLine(new Pen(Color.Black), Right_R + Meisai_Width, Meisai_Header + Meisai_Height, Right_R + Meisai_Width, Left_pitch);



            Pitch = Meisai_Header + Meisai_Gyou;


            e.Graphics.DrawString("※ご注文は、納品日　　　　　　　 となります。", new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 10, Left_pitch + 9);
            e.Graphics.DrawString("前日まで", new Font("ＭＳ Ｐゴシック", 14, FontStyle.Bold), Brushes.Black, Right + 158, Left_pitch + 7);
           // e.Graphics.DrawString("　納品は、火・水・金・土曜日となります。", new Font("ＭＳ Ｐゴシック", 12, FontStyle.Bold), Brushes.Black, Right + 10, Left_pitch + 29);

            Pitch += Meisai_Gyou;

            int Right_Pitch = Pitch;

            //Print_Pos = 0;

            if (Print_Pos < Meisai_Gyou)
            {
                for (int hh = Print_Count; hh < dataSet3.DataTable1.Rows.Count; hh++)
                {                   
                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][3].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 2, Pitch + 7);

                    string Code = dataSet3.DataTable1.Rows[hh][0].ToString();
                    int S_pitch = 11;
                    if (Code == "●")
                    {
                        Code = "";
                        e.Graphics.FillRectangle(new SolidBrush(Color.White), Right + 22, Pitch + 1, Meisai_Width - 22, Meisai_Gyou - 2);
                        S_pitch = 8;
                    }
                    e.Graphics.DrawString(Code, new Font("ＭＳ Ｐゴシック", 7), Brushes.Black, Right + 20, Pitch + 1);

                    if (English == "True")
                    {
                        e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][1].ToString(), new Font("ＭＳ Ｐゴシック", 7), Brushes.Black, Right + 60, Pitch + 1);

                        e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][2].ToString(), new Font("ＭＳ Ｐゴシック", 13), Brushes.Black, Right + 21, Pitch + S_pitch - 2);

                    }
                    else
                    {
                        e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][1].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 21, Pitch + S_pitch);
                    }

                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][4].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 161, Pitch + 7);

                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][5].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 204, Pitch + 7);

                    int Tanka = 0;
                    string St_tanka = "";
                    if (int.TryParse(dataSet3.DataTable1.Rows[hh][6].ToString(), out Tanka) == true)
                    {
                        St_tanka = Tanka.ToString("n0");
                        St_tanka = @"\" + St_tanka;
                    }
                    e.Graphics.DrawString(St_tanka, new Font("ＭＳ Ｐゴシック", 11, FontStyle.Bold), Brushes.Black,
                        (Right + 298) - e.Graphics.MeasureString(St_tanka, new Font("ＭＳ Ｐゴシック", 11, FontStyle.Bold)).Width, Pitch + 7);


                    Pitch += Meisai_Gyou;

                    Print_Count++;
                    Print_Pos++;

                    if (Print_Pos >= Meisai_Pitch)
                    {
                        break;
                    }

                }
            }

            if (Print_Pos >= Meisai_Pitch)
            {

                Pitch = Right_Pitch;
                for (int hh = Print_Count; hh < dataSet3.DataTable1.Rows.Count; hh++)
                {
                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][3].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 2, Pitch + 7);

                    string Code = dataSet3.DataTable1.Rows[hh][0].ToString();
                    int S_pitch = 11;
                    if (Code == "●")
                    {
                        Code = "";
                        e.Graphics.FillRectangle(new SolidBrush(Color.White), Right_R + 22, Pitch + 1, Meisai_Width - 22, Meisai_Gyou - 2);
                        S_pitch = 8;
                    }
                    e.Graphics.DrawString(Code, new Font("ＭＳ Ｐゴシック", 7), Brushes.Black, Right_R + 20, Pitch + 1);

                    if (English == "True")
                    {
                        e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][1].ToString(), new Font("ＭＳ Ｐゴシック", 7), Brushes.Black, Right_R + 60, Pitch + 1);

                        e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][2].ToString(), new Font("ＭＳ Ｐゴシック", 13), Brushes.Black, Right_R + 21, Pitch + S_pitch - 2);

                    }
                    else
                    {
                        e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][1].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 21, Pitch + S_pitch);
                    }

                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][4].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 161, Pitch + 7);

                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][5].ToString(), new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 204, Pitch + 7);

                    int Tanka = 0;
                    string St_tanka = "";
                    if (int.TryParse(dataSet3.DataTable1.Rows[hh][6].ToString(), out Tanka) == true)
                    {
                        St_tanka = Tanka.ToString("n0");
                        St_tanka = @"\" + St_tanka;
                    }
                    e.Graphics.DrawString(St_tanka, new Font("ＭＳ Ｐゴシック", 11, FontStyle.Bold), Brushes.Black,
                        (Right_R + 298) - e.Graphics.MeasureString(St_tanka, new Font("ＭＳ Ｐゴシック", 11, FontStyle.Bold)).Width, Pitch + 7);


                    Pitch += Meisai_Gyou;

                    if (Print_Count+1 == (dataSet3.DataTable1.Rows.Count))
                    {
                        break;
                    }

                    Print_Count++;
                    Print_Pos++;

                    

                    if (Print_Pos == (Meisai_Pitch + Meisai_Pitch_Right))
                    {
                        break;
                    }

                }

            }

            if (Print_Count+1 == (dataSet3.DataTable1.Rows.Count))
            {
                e.HasMorePages = false;
            }


            if (Print_Pos == (Meisai_Pitch + Meisai_Pitch_Right))
            {
                Print_Pos = 0;
                e.HasMorePages = true;              
            }
        }

        private void printDocument4_BeginPrint(object sender, System.Drawing.Printing.PrintEventArgs e)
        {
            Print_Count = 0;
            Print_Pos = 0;
        }

        private void ナンキ注文書印刷ToolStripMenuItem_Click(object sender, EventArgs e)
        {
            //printPreviewDialog1.Document = printDocument3;
            //printPreviewDialog1.Width = 1000;
            //printPreviewDialog1.Height = 700;
            //printPreviewDialog1.StartPosition = FormStartPosition.CenterScreen;
            //printPreviewDialog1.ShowDialog();

            printDocument3.Print();
        }

        private void printDocument3_PrintPage(object sender, System.Drawing.Printing.PrintPageEventArgs e)
        {
            int Header = 40;//////////////////////ヘッダー
            int Right = 40;///////////////////////左余白
            int Header_Gyou = 20;//////////////////ヘッダー行間
            int Pitch = 0;/////////////////////////ピッチ
            int Meisai_Width = 350;/////////////////明細幅
            int Meisai_Header = 0;//////////////////明細高さスタート位置
            int Meisai_Height = 0;//////////////////明細高さ
            int Meisai_Pitch = 41;//////////////////明細行数
            int Meisai_Gyou = 22;///////////////////明細行間
            int Meisai_Pitch_Right = 41;/////////////右明細行数

            string English = "";
            foreach (DataSet1.DataTable1Row abc in dataSet1.DataTable1)
            {
                if (User_No == abc[0].ToString())
                {
                    if (abc.英語表記.ToString() == "英語")
                    {
                        English = "True";
                        break;
                    }
                }
            }

            e.Graphics.DrawString("青果物オーダー用紙", new Font("ＭＳ Ｐゴシック", 20), Brushes.Black, 270, Header);

            Pitch = Header + Header_Gyou + 10;
            e.Graphics.DrawString(listBox1.SelectedItem.ToString() + "　様", new Font("ＭＳ Ｐゴシック", 18), Brushes.Black, Right, Pitch);
            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch + 30,
              Right + e.Graphics.MeasureString(listBox1.SelectedItem.ToString() + "　様", new Font("ＭＳ Ｐゴシック", 18)).Width, Pitch + 30);

            e.Graphics.DrawString("納品日　 　月　　日", new Font("ＭＳ Ｐゴシック", 14), Brushes.Black, Right, Pitch + 45);

            Pitch += 10;
            e.Graphics.DrawString("株式会社　ナンキ", new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 560, Pitch -= Header_Gyou);
            Pitch += Header_Gyou + 5;
            e.Graphics.DrawString("FAX : 045-633-1927", new Font("ＭＳ Ｐゴシック", 14), Brushes.Black, Right + 560, Pitch - 3);
            Pitch += Header_Gyou;
            e.Graphics.DrawString("TEL : 045-633-1946", new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 560, Pitch);

            Pitch += Header_Gyou;
            e.Graphics.DrawString("担当者携帯 : 080-3009-0141", new Font("ＭＳ Ｐゴシック", 12), Brushes.Black, Right + 505, Pitch);

            Pitch += Header_Gyou + 10;



            Meisai_Header = Pitch;

            e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);

            e.Graphics.DrawString("コード", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 10, Pitch + 5);
            e.Graphics.DrawString("商 品 名", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 100, Pitch + 5);
            e.Graphics.DrawString("規格", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 208, Pitch + 5);
            e.Graphics.DrawString("単位", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 258, Pitch + 5);
            e.Graphics.DrawString("数量", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right + 308, Pitch + 5);


            for (int hh = 0; hh < Meisai_Pitch + 1; hh++)
            {
                Pitch += Meisai_Gyou;
                e.Graphics.DrawLine(new Pen(Color.Black), Right, Pitch, Right + Meisai_Width, Pitch);
                Meisai_Height += Meisai_Gyou;
            }

            e.Graphics.DrawLine(new Pen(Color.Black), Right, Meisai_Header, Right, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 60, Meisai_Header, Right + 60, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 200, Meisai_Header, Right + 200, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 250, Meisai_Header, Right + 250, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + 300, Meisai_Header, Right + 300, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right + Meisai_Width, Meisai_Header, Right + Meisai_Width, Meisai_Header + Meisai_Height);


            Pitch = Meisai_Header;
            int Right_R = Right + 380;
            Meisai_Height = 0;

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R, Pitch, Right_R + Meisai_Width, Pitch);

            e.Graphics.DrawString("コード", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 10, Pitch + 5);
            e.Graphics.DrawString("商 品 名", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 100, Pitch + 5);
            e.Graphics.DrawString("規格", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 208, Pitch + 5);
            e.Graphics.DrawString("単位", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 258, Pitch + 5);
            e.Graphics.DrawString("数量", new Font("ＭＳ Ｐゴシック", 11), Brushes.Black, Right_R + 308, Pitch + 5);

            for (int hh = 0; hh < Meisai_Pitch + 1; hh++)
            {
                Pitch += Meisai_Gyou;
                e.Graphics.DrawLine(new Pen(Color.Black), Right_R, Pitch, Right_R + Meisai_Width, Pitch);
                Meisai_Height += Meisai_Gyou;
            }

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R, Meisai_Header, Right_R, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + 60, Meisai_Header, Right_R + 60, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + 200, Meisai_Header, Right_R + 200, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + 250, Meisai_Header, Right_R + 250, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + 300, Meisai_Header, Right_R + 300, Meisai_Header + Meisai_Height);

            e.Graphics.DrawLine(new Pen(Color.Black), Right_R + Meisai_Width, Meisai_Header, Right_R + Meisai_Width, Meisai_Header + Meisai_Height);


            Pitch = Meisai_Header + Meisai_Gyou;
            int Right_Pitch = Pitch;


            if (Print_Pos < Meisai_Gyou)
            {
                for (int hh = Print_Count; hh < dataSet3.DataTable1.Rows.Count; hh++)
                {
                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][0].ToString(), new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right + 2, Pitch + 5);

                 
                    if (English == "True")
                    {
                        e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][2].ToString(), new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right + 63, Pitch + 5);

                     }
                    else
                    {
                        e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][1].ToString(), new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right + 63, Pitch + 5);
                    }

                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][4].ToString(), new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right + 213, Pitch + 5);

                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][5].ToString(), new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right + 263, Pitch + 5);

                   

                    Pitch += Meisai_Gyou;

                    Print_Count++;
                    Print_Pos++;

                    if (Print_Pos >= Meisai_Pitch)
                    {
                        break;
                    }


                }

            }

            if (Print_Pos >= Meisai_Pitch)
            {
                Pitch = Right_Pitch;
                for (int hh = Print_Count; hh < dataSet3.DataTable1.Rows.Count; hh++)
                {

                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][0].ToString(), new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right_R + 2, Pitch + 5);


                    if (English == "True")
                    {
                        e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][2].ToString(), new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right_R + 63, Pitch + 5);

                    }
                    else
                    {
                        e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][1].ToString(), new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right_R + 63, Pitch + 5);
                    }

                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][4].ToString(), new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right_R + 213, Pitch + 5);

                    e.Graphics.DrawString(dataSet3.DataTable1.Rows[hh][5].ToString(), new Font("ＭＳ Ｐゴシック", 10), Brushes.Black, Right_R + 263, Pitch + 5);




                    Pitch += Meisai_Gyou;

                    if (Print_Count + 1 == (dataSet3.DataTable1.Rows.Count))
                    {
                        break;
                    }

                    Print_Count++;
                    Print_Pos++;



                    if (Print_Pos == (Meisai_Pitch + Meisai_Pitch_Right))
                    {
                        break;
                    }


                }
            }

            if (Print_Count + 1 == (dataSet3.DataTable1.Rows.Count))
            {
                e.HasMorePages = false;
            }


            if (Print_Pos == (Meisai_Pitch + Meisai_Pitch_Right))
            {
                Print_Pos = 0;
                e.HasMorePages = true;
            }

        }

        private void printDocument3_BeginPrint(object sender, System.Drawing.Printing.PrintEventArgs e)
        {
            Print_Count = 0;
            Print_Pos = 0;
        }

        private void Select_Group()
        {
            int pos = 0;
            foreach (DataGridViewRow abc in dataGridView2.SelectedRows)
            {
                pos = abc.Index;
                break;
            }

            label24.Text = dataGridView2.Rows[pos].Cells[0].Value.ToString();
            label34.Text = dataGridView2.Rows[pos].Cells[1].Value.ToString();
            label39.Text = dataGridView2.Rows[pos].Cells[2].Value.ToString();
            label40.Text = dataGridView2.Rows[pos].Cells[3].Value.ToString();
            label64.Text = dataGridView2.Rows[pos].Cells[4].Value.ToString();
            label71.Text = dataGridView2.Rows[pos].Cells[5].Value.ToString();
            label72.Text = dataGridView2.Rows[pos].Cells[6].Value.ToString();
            label73.Text = dataGridView2.Rows[pos].Cells[7].Value.ToString();

            int Uri = 0;
            int Siire = 0;
            if (int.TryParse(label72.Text, out Uri) == true && int.TryParse(label73.Text, out Siire) == true)
            {
                double Arari = Uri - Siire;
                double A_ritu = Arari / Uri * 100;
                int Ritu = (int)A_ritu;
                label74.Text = Ritu.ToString() + " %";
                label74.Visible = true;
            }
            else
            {
                label74.Visible = false;
            }

        }

        private void Group_Text_Open()
        {
            label24.Visible = true;
            label34.Visible = true;
            label39.Visible = true;
            label40.Visible = true;
            label64.Visible = true;
            label71.Visible = true;
            label72.Visible = true;
            label73.Visible = true;
            //label74.Visible = true;
        }

        private void Group_Text_Close()
        {
            label24.Visible = false;
            label34.Visible = false;
            label39.Visible = false;
            label40.Visible = false;
            label64.Visible = false;
            label71.Visible = false;
            label72.Visible = false;
            label73.Visible = false;
            label74.Visible = false;

        }



        ///////////////////////////////////////　商　品　///////////////////////////////////////////////////////

        private void dataGridView3_CellClick(object sender, DataGridViewCellEventArgs e)
        {
            if (dataGridView3.Rows.Count > 0)
            {
                if (dataGridView3.Rows.GetRowCount(DataGridViewElementStates.Selected) == 1)
                {
                    Select_Item();
                    Item_Text_Open();
                }
            }
        }

        private void Select_Item()
        {
            int pos = 0;
            foreach (DataGridViewRow abc in dataGridView3.SelectedRows)
            {
                pos = abc.Index;
                break;
            }

            label9.Text = dataGridView3.Rows[pos].Cells[0].Value.ToString();
            label42.Text = dataGridView3.Rows[pos].Cells[1].Value.ToString();
            label57.Text = dataGridView3.Rows[pos].Cells[2].Value.ToString();
            label59.Text = dataGridView3.Rows[pos].Cells[3].Value.ToString();
            label65.Text = dataGridView3.Rows[pos].Cells[4].Value.ToString();
            label68.Text = dataGridView3.Rows[pos].Cells[5].Value.ToString();
            label69.Text = dataGridView3.Rows[pos].Cells[6].Value.ToString();
            label70.Text = dataGridView3.Rows[pos].Cells[7].Value.ToString() + " 円";
            label81.Text = dataGridView3.Rows[pos].Cells[9].Value.ToString();

        }

        private void Item_Text_Open()
        {
            label9.Visible = true;
            label42.Visible = true;
            label57.Visible = true;
            label59.Visible = true;
            label65.Visible = true;
            label68.Visible = true;
            label69.Visible = true;
            label70.Visible = true;
            label81.Visible = true;
        }



        //////////////////////////////////////　ユーザー　///////////////////////////////////////////////////////       

        private void dataGridView1_CellClick(object sender, DataGridViewCellEventArgs e)
        {
            if (dataGridView1.Rows.Count > 0)
            {
                if (dataGridView1.Rows.GetRowCount(DataGridViewElementStates.Selected) == 1)
                {
                    Select_User();
                    User_Text_Open();
                }
            }
        }

        private void Select_User()
        {
            int pos = 0;
            foreach (DataGridViewRow abc in dataGridView1.SelectedRows)
            {
                pos = abc.Index;
                break;
            }

            label2.Text = dataGridView1.Rows[pos].Cells[0].Value.ToString();
            label14.Text = dataGridView1.Rows[pos].Cells[1].Value.ToString();
            label15.Text = dataGridView1.Rows[pos].Cells[2].Value.ToString();
            label16.Text = dataGridView1.Rows[pos].Cells[3].Value.ToString();
            label17.Text = dataGridView1.Rows[pos].Cells[4].Value.ToString();
            label18.Text = dataGridView1.Rows[pos].Cells[5].Value.ToString();
            label20.Text = dataGridView1.Rows[pos].Cells[6].Value.ToString();
            label28.Text = dataGridView1.Rows[pos].Cells[7].Value.ToString();
            label35.Text = dataGridView1.Rows[pos].Cells[8].Value.ToString();
            label36.Text = dataGridView1.Rows[pos].Cells[9].Value.ToString();
            label48.Text = dataGridView1.Rows[pos].Cells[10].Value.ToString();
            label50.Text = dataGridView1.Rows[pos].Cells[11].Value.ToString();
            label58.Text = dataGridView1.Rows[pos].Cells[12].Value.ToString();





        }

        private void User_Text_Open()
        {
            label2.Visible = true;
            label14.Visible = true;
            label15.Visible = true;
            label16.Visible = true;
            label17.Visible = true;
            label18.Visible = true;
            label20.Visible = true;
            label28.Visible = true;
            label35.Visible = true;
            label36.Visible = true;
            label48.Visible = true;
            label50.Visible = true;
            label58.Visible = true;

        }


        /////////////////////////////////////////　仕入先　////////////////////////////////////////////////////////

        private void Supplier_Set()
        {
            dataSet16.DataTable1.Clear();
            int zz = 0;
            foreach (DataSet14.DataTable1Row mmm in dataSet14.DataTable1)
            {
                zz = 0;
                foreach (DataSet4.DataTable1Row abc in dataSet4.DataTable1)
                {
                    if (mmm.コード.ToString() == abc._02.ToString())
                    {
                        DataRow N_Row = dataSet16.DataTable1.NewRow();
                        if (zz == 0)
                        {
                            N_Row[0] = mmm.コード.ToString();
                            N_Row[1] = mmm.仕入先.ToString();
                        }
                        else
                        {
                            N_Row[0] = "";
                            N_Row[1] = "";
                        }
                        N_Row[2] = abc.商品コード.ToString();
                        N_Row[3] = abc.商品名.ToString();
                        dataSet16.DataTable1.Rows.Add(N_Row);
                        zz++;
                    }

                }

            }

            label83.Text = dataSet16.DataTable1.Rows.Count.ToString() + " 件";
        }        

        /////////////////////////////////////////　設　定　/////////////////////////////////////////////////       

        private void tab5_set_up()
        {
            if (dataSet2.DataTable1.Rows.Count > 0)
            {
                textBox9.Text = dataSet2.DataTable1[0][0].ToString();
                textBox10.Text = dataSet2.DataTable1[0][1].ToString();
                textBox11.Text = dataSet2.DataTable1[0][2].ToString();

                FTP_Name = dataSet2.DataTable1[0][0].ToString();
                FTP_ID = dataSet2.DataTable1[0][1].ToString();
                FTP_PW = dataSet2.DataTable1[0][2].ToString();
            }

            if (dataSet5.DataTable1.Rows.Count > 0)
            {
                textBox17.Text = dataSet5.DataTable1[0][0].ToString();
                textBox18.Text = dataSet5.DataTable1[0][1].ToString();
            }

            if (dataSet10.DataTable1.Rows.Count > 0)
            {
                comboBox1.SelectedItem = dataSet10.DataTable1.Rows[0][0].ToString();
            }

            if (dataSet13.DataTable1.Rows.Count > 0)
            {
                textBox6.Text = dataSet13.DataTable1[0][0].ToString();
                textBox2.Text = dataSet13.DataTable1[0][1].ToString();
                textBox3.Text = dataSet13.DataTable1[0][2].ToString();
                textBox4.Text = dataSet13.DataTable1[0][3].ToString();
                textBox7.Text = dataSet13.DataTable1[0][4].ToString();

            }

            if (dataSet13.DataTable6.Rows.Count > 0)
            {
                textBox14.Text = dataSet13.DataTable6[0][0].ToString();
                textBox19.Text = dataSet13.DataTable6[0][1].ToString();
                textBox16.Text = dataSet13.DataTable6[0][2].ToString();
                textBox15.Text = dataSet13.DataTable6[0][3].ToString();
                textBox13.Text = dataSet13.DataTable6[0][4].ToString();

            }

            if (dataSet13.DataTable7.Rows.Count > 0)
            {
                textBox22.Text = dataSet13.DataTable7[0][0].ToString();
                textBox25.Text = dataSet13.DataTable7[0][1].ToString();
                textBox24.Text = dataSet13.DataTable7[0][2].ToString();
                textBox23.Text = dataSet13.DataTable7[0][3].ToString();
                textBox21.Text = dataSet13.DataTable7[0][4].ToString();

            }

            if(dataSet13.DataTable8.Rows.Count>0)
            {
                textBox20.Text = dataSet13.DataTable8[0][0].ToString();
                textBox12.Text = dataSet13.DataTable8[1][0].ToString();
                textBox8.Text = dataSet13.DataTable8[2][0].ToString();
                textBox26.Text = dataSet13.DataTable8[3][0].ToString();
                textBox27.Text = dataSet13.DataTable8[4][0].ToString();

            }


            if (dataSet13.DataTable2.Rows.Count > 0)
            {
                textBox5.Text = dataSet13.DataTable2[0][0].ToString();
            }
        }

        private void button3_Click(object sender, EventArgs e)////////////////////////////商品別集計表
        {
            Form4 form4 = new Form4(dataSet6, dataSet4);           
            form4.Show();
        }

        private void button6_Click(object sender, EventArgs e)////////////////////////////仕入先別集計表
        {
            Form5 form5 = new Form5(dataSet6, dataSet14, dataSet4, dataSet13);
            form5.Show();
        }

        private void button7_Click(object sender, EventArgs e)////////////////////////////ユーザー別集計表
        {

        }

        private void button16_Click(object sender, EventArgs e)///////////////////////////請求書
        {


            Form7 form7 = new Form7(dataSet6, dataSet1, dataSet13.DataTable2.Rows[0][0].ToString(), dataSet13.DataTable1, dataSet13.DataTable6, dataSet13.DataTable7, dataSet13.DataTable8);
            form7.Show();
        }

        private void button4_Click(object sender, EventArgs e)////////////////////////////自社１登録
        {
            dataSet13.DataTable1.Clear();
            dataSet13.DataTable1.Rows.Add(textBox6.Text, textBox2.Text, textBox3.Text, textBox4.Text, textBox7.Text, "");
            savedata_09();
            MessageBox.Show("登録しました", "自社１設定", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
        }

        private void button18_Click(object sender, EventArgs e)////////////////////////////自社２登録
        {
            dataSet13.DataTable6.Clear();
            dataSet13.DataTable6.Rows.Add(textBox14.Text, textBox19.Text, textBox16.Text, textBox15.Text, textBox13.Text, "");
            savedata_14();
            MessageBox.Show("登録しました", "自社２設定", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
        }

        private void button19_Click(object sender, EventArgs e)////////////////////////////自社３登録
        {
            dataSet13.DataTable7.Clear();
            dataSet13.DataTable7.Rows.Add(textBox22.Text, textBox25.Text, textBox24.Text, textBox23.Text, textBox21.Text, "");
            savedata_15();
            MessageBox.Show("登録しました", "自社３設定", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
        }

        private void button20_Click(object sender, EventArgs e)////////////////////////////振込先登録
        {
            dataSet13.DataTable8.Clear();

            dataSet13.DataTable8.Rows.Add(textBox20.Text);
            dataSet13.DataTable8.Rows.Add(textBox12.Text);
            dataSet13.DataTable8.Rows.Add(textBox8.Text);
            dataSet13.DataTable8.Rows.Add(textBox26.Text);
            dataSet13.DataTable8.Rows.Add(textBox27.Text);

            savedata_16();
            MessageBox.Show("登録しました", "振込先設定", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
        }

        private void button1_Click(object sender, EventArgs e)////////////////////////////ダウンロード登録
        {
            if (comboBox1.SelectedIndex != -1)
            {
                dataSet10.DataTable1.Clear();
                dataSet10.DataTable1.Rows.Add(comboBox1.SelectedItem.ToString());
                savedata_08();
                Timer_Set();
                MessageBox.Show("登録しました", "ダウンロード設定", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
            }

        }

        private void button5_Click(object sender, EventArgs e)/////////////////////////////消費税率登録
        {
            int Tax;
            if (int.TryParse(textBox5.Text, out Tax) == true)
            {
                dataSet13.DataTable2.Clear();
                dataSet13.DataTable2.Rows.Add(textBox5.Text, "", "", "", "", "", "");
                savedata_10();
                MessageBox.Show("登録しました", "消費税率設定", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
            }
            else
            {
                MessageBox.Show("数値を入力して下さい", "消費税設定", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
            }
        }

        private void button9_Click(object sender, EventArgs e)////////////////////////////管理者登録
        {
            if (textBox17.Text != "" && textBox18.Text != "")
            {
                progress_On("管理者データをアップロード");
                backgroundWorker3.RunWorkerAsync(100);
            }
            else
            {
                MessageBox.Show("すべての項目を入力して下さい", "管理者設定", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
            }
        }

        private void backgroundWorker3_DoWork(object sender, DoWorkEventArgs e)
        {
            backgroundWorker3.ReportProgress(30);
            Admin_add();
            savedata_05();
            backgroundWorker3.ReportProgress(60);
           
            backgroundWorker3.ReportProgress(100);


        }

        private void backgroundWorker3_ProgressChanged(object sender, ProgressChangedEventArgs e)
        {
            progressBar1.Value = e.ProgressPercentage;
        }

        private void backgroundWorker3_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            Admin_upload();
            MessageBox.Show("管理者登録データをアップロードしました", "顧客登録", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
            progress_Off();
        }

        private void button2_Click(object sender, EventArgs e)////////////////////////////FTP登録
        {
            if (textBox9.Text != "" && textBox10.Text != "" && textBox11.Text != "")
            {
                if (dataSet2.DataTable1.Rows.Count == 0)
                {
                    dataSet2.DataTable1.AddDataTable1Row(textBox9.Text.ToString(), textBox10.Text.ToString(), textBox11.Text.ToString());
                }
                else
                {
                    dataSet2.DataTable1.Rows[0][0] = textBox9.Text.ToString();
                    dataSet2.DataTable1.Rows[0][1] = textBox10.Text.ToString();
                    dataSet2.DataTable1.Rows[0][2] = textBox11.Text.ToString();
                }

                savedata_02();

                MessageBox.Show("登録しました", "FTP設定", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
                
            }
            else
            {
                MessageBox.Show("すべての項目を入力して下さい", "FTP設定", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
            }
        }       

        private void Admin_add()
        {
            if (dataSet5.DataTable1.Rows.Count == 0)
            {
                dataSet5.DataTable1.AddDataTable1Row(textBox17.Text.ToString(), textBox18.Text.ToString());
            }
            else
            {
                dataSet5.DataTable1.Rows[0][0] = textBox17.Text.ToString();
                dataSet5.DataTable1.Rows[0][1] = textBox18.Text.ToString();
            }
        }
        private void Admin_upload()
        {
            string F_file = "ftp://" + FTP_Name + "/httpdocs/Member/Data/Administer_data.xml";
            string Path = folderpass + @"\Administer_data.xml";

            System.Net.WebClient wc03 = new System.Net.WebClient();
            wc03.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
            wc03.UploadFile(F_file, Path);

            wc03.Dispose();
        }

        private int DL_Timer;
        private void Timer_Set()
        {
            if (dataSet10.DataTable1.Rows.Count > 0)
            {
                string Timer_T = dataSet10.DataTable1.Rows[0][0].ToString();
                if (Timer_T == "30秒")
                {
                    DL_Timer = 30000;
                }
                else if (Timer_T == "1分")
                {
                    DL_Timer = 60000;
                }
                else if (Timer_T == "2分")
                {
                    DL_Timer = 120000;
                }
                else if (Timer_T == "3分")
                {
                    DL_Timer = 180000;
                }
                else if (Timer_T == "5分")
                {
                    DL_Timer = 300000;
                }

                timer1.Interval = DL_Timer;
            }

        }



        /////////////////////////////////////////// 過去のデータ /////////////////////////////////////////


        private void button17_Click(object sender, EventArgs e)/////////////////////////////読み込み
        {
            Old_Data_Set();
        }

        private void comboBox2_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (comboBox2.SelectedIndex != -1)
            {
                if (comboBox2.SelectedIndex == 0)
                {
                    dataSet8.DataTable2.Clear();

                    foreach (DataSet6.DataTable4Row abc in dataSet6.DataTable4)
                    {
                        DataRow N_Row = dataSet8.DataTable2.NewRow();

                        if (abc.顧客名.ToString() != "")
                        {
                            N_Row[0] = abc.顧客名.ToString();
                            N_Row[1] = abc.納品日.ToString();
                            N_Row[2] = abc.金額.ToString();
                            N_Row[3] = abc.発注日時.ToString();
                            N_Row[4] = abc._受注No_.ToString();
                            N_Row[5] = abc.適用1.ToString();
                            dataSet8.DataTable2.Rows.Add(N_Row);
                        }
                    }
                }
                else
                {
                    dataSet8.DataTable2.Clear();

                    foreach (DataSet6.DataTable4Row abc in dataSet6.DataTable4)
                    {
                        DataRow N_Row = dataSet8.DataTable2.NewRow();

                        if (abc.顧客名.ToString() != "")
                        {
                            if (abc.顧客名.ToString() == comboBox2.SelectedItem.ToString())
                            {
                                N_Row[0] = abc.顧客名.ToString();
                                N_Row[1] = abc.納品日.ToString();
                                N_Row[2] = abc.金額.ToString();
                                N_Row[3] = abc.発注日時.ToString();
                                N_Row[4] = abc._受注No_.ToString();
                                N_Row[5] = abc.適用1.ToString();
                                dataSet8.DataTable2.Rows.Add(N_Row);
                            }
                        }
                    }
                }
            }

        }

        private void Old_Data_Set()
        {
            backgroundWorker2.RunWorkerAsync();

        }

        private void backgroundWorker2_DoWork(object sender, DoWorkEventArgs e)
        {
            dataSet8.DataTable2.Clear();

            string F_file = "ftp://" + FTP_Name + "/httpdocs/Member/Data/Old_Order_data.xml";
            string Path = folderpass + @"\Old_Order_data.xml";
            System.Net.WebClient wc = new System.Net.WebClient();
            wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
            wc.DownloadFile(F_file, Path);
            wc.Dispose();
        }

        private void backgroundWorker2_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            dataSet6.DataTable4.Clear();
            comboBox2.Items.Clear();
            comboBox2.Items.Add("すべて");

            string path = folderpass + @"\Old_Order_data.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet6.DataTable4.ReadXml(path);
            }


            foreach (DataSet6.DataTable4Row abc in dataSet6.DataTable4)
            {
                DataRow N_Row = dataSet8.DataTable2.NewRow();

                if (abc.顧客名.ToString() != "")
                {
                    N_Row[0] = abc.顧客名.ToString();
                    N_Row[1] = abc.納品日.ToString();
                    N_Row[2] = abc.金額.ToString();
                    N_Row[3] = abc.発注日時.ToString();
                    N_Row[4] = abc._受注No_.ToString();
                    N_Row[5] = abc.適用1.ToString();
                    dataSet8.DataTable2.Rows.Add(N_Row);
                }                

                if (abc.顧客名.ToString() != "")
                {
                    int zz = 0;
                    foreach (object C_Item in comboBox2.Items)
                    {
                        if (abc.顧客名.ToString() == C_Item.ToString())
                        {
                            zz++;
                            break;
                        }
                    }
                    if (zz == 0)
                    {
                        comboBox2.Items.Add(abc.顧客名.ToString());
                    }
                }

            }

            comboBox2.SelectedIndex = 0;
            label86.Text = dataSet8.DataTable2.Rows.Count.ToString() + " 件";
            label86.Visible = true;



        }

        private void dataGridView8_DoubleClick(object sender, EventArgs e)
        {
            if (dataGridView8.Rows.GetRowCount(DataGridViewElementStates.Selected) == 1)
            {
                int pos = 0;
                foreach (DataGridViewRow c in dataGridView8.SelectedRows)
                {
                    pos = c.Index;
                    break;
                }

                string No = dataGridView8[4, pos].Value.ToString();

                Form9 form9 = new Form9(No, dataSet6.DataTable4);
                form9.Show();
            }

        }


        //////////////////////////////////////////////////////////////////////////////////////////////////

        private string folderpass = "";
        private string Group_pass = "";
        private string FTP_Name = "";
        private string FTP_ID = "";
        private string FTP_PW = "";

        private void Set_Up()
        {
            folderpass = System.IO.Directory.GetCurrentDirectory();
            folderpass = folderpass + @"\Data";
            Group_pass = System.IO.Directory.GetCurrentDirectory() + @"\Group_Item\";

            progressBar1.Visible = false;
            label23.Visible = false;

            loaddata_01();
            loaddata_02();
            loaddata_03();
            loaddata_04();
            loaddata_05();
            loaddata_06();
            loaddata_08();
            loaddata_09();
            loaddata_10();
            loaddata_11();
            loaddata_12();
            loaddata_13();
            loaddata_14();
            loaddata_15();
            loaddata_16();
            Timer_Set();

          
            label44.Text = dataSet6.DataTable1.Rows.Count.ToString();

           

            tab5_set_up();

            DateTime dt = DateTime.Now;
            dateTimePicker1.Value = dt;
            dateTimePicker2.Value = dt;

            dataGridView1.ClearSelection();
            label63.Visible = false;
            combo3_add();


            Version_Check();


        }
        private void Back_UP_Start()
        {
            System.Diagnostics.Process[] ps = System.Diagnostics.Process.GetProcesses();

            int zz = 0;
            foreach (System.Diagnostics.Process p in ps)
            {
                if (p.ProcessName.ToString() == "Back_Up")
                {
                    zz++;
                    break;
                }
            }
            if (zz == 0)
            {
                string Local_Path = folderpass.Replace(@"Local_Nanki\Local_Nanki\bin\Debug\Data", @"Back_Up\Back_Up\bin\Debug");
                process2.StartInfo.FileName = Local_Path + @"\Back_Up.exe";
                process2.StartInfo.WorkingDirectory = Local_Path;

                process2.Start();
            }

        }
        private void progress_On(string str)
        {
            progressBar1.Value = 0;
            progressBar1.Visible = true;
            label23.Text = str + "しています．．．";
            label23.Visible = true;

        }
        private void progress_Off()
        {
            progressBar1.Visible = false;
            label23.Text = "";
            label23.Visible = false;

        }      

        private void loaddata_01()
        {
            string path = folderpass + @"\Customer_data.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet1.DataTable1.ReadXml(path);
            }
        }
        private void savedata_01()
        {
            string path = folderpass + @"\Customer_data.xml";
            dataSet1.DataTable1.WriteXml(path);
        }
        private void loaddata_02()
        {
            string path = folderpass + @"\FTP_data.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet2.DataTable1.ReadXml(path);
            }
        }
        private void savedata_02()
        {
            string path = folderpass + @"\FTP_data.xml";
            dataSet2.DataTable1.WriteXml(path);
        }
        private void loaddata_03()
        {
            string path = folderpass + @"\Item_data.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet4.DataTable1.ReadXml(path);
            }
        }
        private void savedata_03()
        {
            string path = folderpass + @"\Item_data.xml";
            dataSet4.DataTable1.WriteXml(path);
        }
        private void loaddata_04()
        {
            listBox1.Items.Clear();

            if (System.IO.Directory.Exists(Group_pass) == true)
            {
                foreach (string F_name in System.IO.Directory.GetFiles(Group_pass))
                {
                    string File_N = System.IO.Path.GetFileName(F_name);
                    File_N = File_N.Replace(".xml", "");
                    File_N = File_N.Replace(".XML", "");
                    if (File_N.Contains("A_Date_") == false)
                    {
                        listBox1.Items.Add(File_N);
                    }
                }
            }
        }
        private void loaddata_05()
        {
            string path = folderpass + @"\Administer_data.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet5.DataTable1.ReadXml(path);
            }
        }
        private void savedata_05()
        {
            string path = folderpass + @"\Administer_data.xml";
            dataSet5.DataTable1.WriteXml(path);
        }
        private void loaddata_06()
        {
            string path = folderpass + @"\Order_data.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet6.DataTable1.ReadXml(path);
            }
        }
        private void savedata_06()
        {
            string path = folderpass + @"\Order_data.xml";
            dataSet6.DataTable1.WriteXml(path);
        }
        private void loaddata_08()
        {
            string path = folderpass + @"\Timer_data.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet10.DataTable1.ReadXml(path);
            }
        }
        private void savedata_08()
        {
            string path = folderpass + @"\Timer_data.xml";
            dataSet10.DataTable1.WriteXml(path);
        }
        private void loaddata_09()
        {
            string path = folderpass + @"\Company_data.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet13.DataTable1.ReadXml(path);
            }
        }
        private void savedata_09()
        {
            string path = folderpass + @"\Company_data.xml";
            dataSet13.DataTable1.WriteXml(path);
        }
        private void loaddata_10()
        {
            string path = folderpass + @"\Tax_data.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet13.DataTable2.ReadXml(path);
            }
        }
        private void savedata_10()
        {
            string path = folderpass + @"\Tax_data.xml";
            dataSet13.DataTable2.WriteXml(path);
        }
        private void loaddata_11()
        {
            string path = folderpass + @"\Supplier_data.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet14.DataTable1.ReadXml(path);
            }
        }
        private void savedata_11()
        {
            string path = folderpass + @"\Supplier_data.xml";
            dataSet14.DataTable1.WriteXml(path);
        }
        private void loaddata_12()
        {
            string path = folderpass + @"\Version_data_Old.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet13.DataTable3.ReadXml(path);
                this.Text = "ナンキ販売管理　Version " + dataSet13.DataTable3.Rows[0][0].ToString();
            }
        }
        private void savedata_12()
        {
            string path = folderpass + @"\Version_data_Old.xml";
            dataSet13.DataTable3.WriteXml(path);
        }
        private void loaddata_13()
        {
            string path = folderpass + @"\Version_data_New.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet13.DataTable4.ReadXml(path);
            }
        }
        private void savedata_13()
        {
            string path = folderpass + @"\Version_data_New.xml";
            dataSet13.DataTable4.WriteXml(path);
        }
        private void loaddata_14()
        {
            string path = folderpass + @"\Company_data_2.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet13.DataTable6.ReadXml(path);
            }
        }
        private void savedata_14()
        {
            string path = folderpass + @"\Company_data_2.xml";
            dataSet13.DataTable6.WriteXml(path);
        }
        private void loaddata_15()
        {
            string path = folderpass + @"\Company_data_3.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet13.DataTable7.ReadXml(path);
            }
        }
        private void savedata_15()
        {
            string path = folderpass + @"\Company_data_3.xml";
            dataSet13.DataTable7.WriteXml(path);
        }
        private void loaddata_16()
        {
            string path = folderpass + @"\Bank_data.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet13.DataTable8.ReadXml(path);
            }
        }
        private void savedata_16()
        {
            string path = folderpass + @"\Bank_data.xml";
            dataSet13.DataTable8.WriteXml(path);
        }

        private void timer1_Tick(object sender, EventArgs e)
        {
            if (progressBar1.Visible == false)
            {
                progress_On("データをダウンロード");
                backgroundWorker4.RunWorkerAsync();
            }
        }

        private int DL_Pos;
        private int DL_Pos_C;
        private int Order_Pos;
        private int Order_Last_No = 0;

        private void Data_Down_Load()
        {
            DL_Count();
            DL_Data();
            DL_Group();
            backgroundWorker4.ReportProgress(100);

        }
        private void DL_Count()
        {
            DL_Pos = 0;
            DL_Pos_C = 1;
            Order_Pos = dataSet6.DataTable1.Rows.Count;

            if (dataSet6.DataTable1.Rows.Count > 0)
            {
                Order_Last_No = int.Parse(dataSet6.DataTable1.Rows[dataSet6.DataTable1.Rows.Count - 1][13].ToString().Substring(0, 6));
            }


            Uri u = new Uri("ftp://" + FTP_Name + "/httpdocs/Member/Data/");

            System.Net.FtpWebRequest ftpReq = (System.Net.FtpWebRequest)System.Net.WebRequest.Create(u);

            ftpReq.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
            ftpReq.Method = System.Net.WebRequestMethods.Ftp.ListDirectory;
            ftpReq.KeepAlive = false;
            ftpReq.UsePassive = false;

            System.Net.FtpWebResponse ftpRes = (System.Net.FtpWebResponse)ftpReq.GetResponse();

            System.IO.StreamReader sr = new System.IO.StreamReader(ftpRes.GetResponseStream());

            string res = sr.ReadToEnd();
            textBox1.Text = res;
            DL_Pos = textBox1.Lines.Length - 1;

           
            Uri n_u = new Uri("ftp://" + FTP_Name + "/httpdocs/Member/Group_Item/");

            System.Net.FtpWebRequest n_ftpReq = (System.Net.FtpWebRequest)System.Net.WebRequest.Create(n_u);

            n_ftpReq.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
            n_ftpReq.Method = System.Net.WebRequestMethods.Ftp.ListDirectory;
            n_ftpReq.KeepAlive = false;
            n_ftpReq.UsePassive = false;

            System.Net.FtpWebResponse n_ftpRes = (System.Net.FtpWebResponse)n_ftpReq.GetResponse();

            System.IO.StreamReader n_sr = new System.IO.StreamReader(n_ftpRes.GetResponseStream());
            string n_res = n_sr.ReadToEnd();
            textBox1.Text = n_res;
            int N_pos = textBox1.Lines.Length - 1;

            DL_Pos += N_pos;

        }
        private void DL_Group()
        {
            if (System.IO.Directory.Exists(Group_pass) == true)
            {
                foreach (string D_File in System.IO.Directory.GetFiles(Group_pass))
                {
                    System.IO.File.Delete(D_File);
                }
            }

            Uri u = new Uri("ftp://" + FTP_Name + "/httpdocs/Member/Group_Item/");

            System.Net.FtpWebRequest ftpReq = (System.Net.FtpWebRequest)System.Net.WebRequest.Create(u);

            ftpReq.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
            ftpReq.Method = System.Net.WebRequestMethods.Ftp.ListDirectory;
            ftpReq.KeepAlive = false;
            ftpReq.UsePassive = false;

            System.Net.FtpWebResponse ftpRes = (System.Net.FtpWebResponse)ftpReq.GetResponse();

            System.IO.StreamReader sr = new System.IO.StreamReader(ftpRes.GetResponseStream());
            string res = sr.ReadToEnd();
            textBox1.Text = res;
            for (int hh = 0; hh < textBox1.Lines.Length - 1; hh++)
            {
                string F_N = textBox1.Lines[hh].ToString().Replace(" ", "");
                string F_file = "ftp://" + FTP_Name + "/httpdocs/Member/Group_Item/" + F_N;
                string Path = Group_pass + F_N;
                System.Net.WebClient wc = new System.Net.WebClient();
                wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
                wc.DownloadFile(F_file, Path);
                wc.Dispose();

                backgroundWorker4.ReportProgress((100 / DL_Pos) * DL_Pos_C);
                DL_Pos_C++;
            }
            sr.Close();

            ftpRes.Close();

        }
        private void DL_Data()
        {
            Uri u = new Uri("ftp://" + FTP_Name + "/httpdocs/Member/Data/");

            System.Net.FtpWebRequest ftpReq = (System.Net.FtpWebRequest)System.Net.WebRequest.Create(u);

            ftpReq.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
            ftpReq.Method = System.Net.WebRequestMethods.Ftp.ListDirectory;
            ftpReq.KeepAlive = false;
            ftpReq.UsePassive = false;

            System.Net.FtpWebResponse ftpRes = (System.Net.FtpWebResponse)ftpReq.GetResponse();

            System.IO.StreamReader sr = new System.IO.StreamReader(ftpRes.GetResponseStream());
            string res = sr.ReadToEnd();
            textBox1.Text = res;
            for (int hh = 0; hh < textBox1.Lines.Length - 1; hh++)
            {
                string F_N = textBox1.Lines[hh].ToString().Replace(" ", "");
                string F_file = "ftp://" + FTP_Name + "/httpdocs/Member/Data/" + F_N;
                string Path = folderpass + @"\" + F_N;
                if (F_N != "Old_Order_data.xml")
                {
                    System.Net.WebClient wc = new System.Net.WebClient();
                    wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
                    wc.DownloadFile(F_file, Path);
                    wc.Dispose();

                    backgroundWorker4.ReportProgress((100 / DL_Pos) * DL_Pos_C);
                    DL_Pos_C++;
                }
            }
            sr.Close();

            ftpRes.Close();
        } 
        private int f3_open = 0;
        private void Order_Check()
        {
            string Open_Mesg = "";

            int New_Last_No = 0;
            int No_Pos = 0;
            if (dataSet6.DataTable1.Rows.Count > 0)
            {
                New_Last_No = int.Parse(dataSet6.DataTable1.Rows[dataSet6.DataTable1.Rows.Count - 1][13].ToString().Substring(0, 6));
            }

            if (Order_Last_No < New_Last_No)
            {
                No_Pos = New_Last_No - Order_Last_No;

                for (int hh = 0; hh < No_Pos; hh++)
                {
                    Order_Last_No++;
                    string No = Order_Last_No.ToString("000000");

                    foreach (DataSet6.DataTable1Row abc in dataSet6.DataTable1)
                    {
                        if (abc[13].ToString() == No && abc[14].ToString() == "User")
                        {
                            Open_Mesg = abc[1].ToString();

                            f3_open++;
                            int aa = 500 + (f3_open * 20);
                            int bb = 250 + (f3_open * 20);

                            Form3 form3 = new Form3(Open_Mesg);
                            form3.Closed += new EventHandler(Form3_Closed);
                            form3.Location = new Point(aa, bb);

                            form3.Show();


                            break;
                        }
                    }

                   
                       


                    
                }


            }


        }
        private void Version_Check()
        {
            if (dataSet13.DataTable3.Rows[0][0].ToString() == dataSet13.DataTable4.Rows[0][0].ToString())
            {
                label84.Visible = false;
              
            }
            else
            {
                label84.Visible = true;
            }

           

        }

        private void backgroundWorker4_DoWork(object sender, DoWorkEventArgs e)
        {
            Data_Down_Load();

        }
        private void backgroundWorker4_ProgressChanged(object sender, ProgressChangedEventArgs e)
        {
            progressBar1.Value = e.ProgressPercentage;
        }
        private void backgroundWorker4_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            dataSet6.DataTable1.Clear();
            loaddata_06();
           // if (dataSet6.DataTable1.Rows.Count > 0)
            //{
            //    dataSet6.DataTable1.Rows.RemoveAt(0);
           // }

            //if (dataSet6.DataTable1.Rows.Count > 0)
            //{
              //  if (dataSet6.DataTable1.Rows[0][0].ToString() == "AAA")
                //{
                  //  dataSet6.DataTable1.Rows.RemoveAt(0);
                //}

            //}

            label44.Text = dataSet6.DataTable1.Rows.Count.ToString() + " 件";
            //savedata_06();

            if (Order_Pos < dataSet6.DataTable1.Rows.Count)
            {
                dataSet8.DataTable1.Clear();
                data_header();
                label63.Visible = false;
                comboBox3.SelectedIndex = 0;
            }


            dataSet1.DataTable1.Clear();
            loaddata_01();

            dataSet4.DataTable1.Clear();
            loaddata_03();

            loaddata_04();

            dataSet5.DataTable1.Clear();
            loaddata_05();

            Order_Check();

            if (Data_kousin == "True")
            {
                Data_kousin = "";
                MessageBox.Show("最新の情報に更新されました", "更新", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
                dataSet8.DataTable1.Clear();
                data_header();
                label63.Visible = false;
                comboBox3.SelectedIndex = 0;
            }

          
            Order_Pos = 0;
            progress_Off();
            dataSet13.DataTable4.Clear();
            loaddata_13();
            Version_Check();
        }

        
    }
}
