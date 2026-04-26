using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Back_Up
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
        }       

        private void Form1_Load(object sender, EventArgs e)
        {
            this.Icon = global::Back_Up.Properties.Resources.n_04;

            folderpass = System.IO.Directory.GetCurrentDirectory();

            Local_Data = folderpass.Replace(@"Back_Up\Back_Up\bin\Debug", @"Local_Nanki\Local_Nanki\bin\debug\Data\");

            Local_Path = folderpass.Replace(@"Back_Up\Back_Up\bin\Debug", "");
            Local_Path += @"バックアップデータ\";

            string XML_F = folderpass + @"\FTP_data.xml";

            if (System.IO.File.Exists(XML_F) == true)
            {
                dataSet2.DataTable1.ReadXml(XML_F);
                FTP_Name = dataSet2.DataTable1.Rows[0][0].ToString();
                FTP_ID = dataSet2.DataTable1.Rows[0][1].ToString();
                FTP_PW = dataSet2.DataTable1.Rows[0][2].ToString();

            }

            string path = folderpass + @"\BackUp_Log.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet1.DataTable1.ReadXml(path);
            }
            DataTable sort_table = dataSet1.DataTable1.Clone();
            DataView dv = new DataView(dataSet1.DataTable1);
            dv.Sort = "日時 DESC";
            foreach (DataRowView abc in dv)
            {
                sort_table.ImportRow(abc.Row);
            }

            dataSet1.DataTable1.Clear();
            for (int hh = 0; hh < sort_table.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet1.DataTable1.NewRow();
                for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                {
                    N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                }
                dataSet1.DataTable1.Rows.Add(N_Row);
            }

            label3.Text = dataSet1.DataTable1.Rows.Count.ToString() + " 件";
            dataGridView1.ClearSelection();


            timer1.Interval =3600000;////////////////////////////////////// タイマー　60分　(1分=60000)

            label2.Visible = true;
            if (backgroundWorker1.IsBusy)
            {
                backgroundWorker1.CancelAsync();
            }
            else
            {
                backgroundWorker1.RunWorkerAsync();
            }

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

        private void notifyIcon1_MouseDoubleClick(object sender, MouseEventArgs e)
        {
            WindowState = FormWindowState.Normal;
            ShowInTaskbar = true;
        }

        private void Form1_Resize(object sender, EventArgs e)
        {
            if (WindowState == FormWindowState.Minimized)
            {
                ShowInTaskbar = false;
            }
        }

        private void 終了XToolStripMenuItem_Click(object sender, EventArgs e)
        {
            DialogResult ret = MessageBox.Show("終了しますか？", "バックアップ作成", MessageBoxButtons.YesNo, MessageBoxIcon.Asterisk);
            if (ret == DialogResult.Yes)
            {
                this.Close();
            }            
        }
       
        private int BackUp_Span = 7;///////////////////////////////////////// バックアップ保持日数////////

        private string folderpass = "";
        private string Local_Path = "";
        private string Local_Data = "";
        private string M_Folder_Name = "";
        private string H_Folder_Name = "";
        private string FTP_Name = "";
        private string FTP_ID = "";
        private string FTP_PW = "";

        private void timer1_Tick(object sender, EventArgs e)
        {
            label2.Visible = true;
            if (backgroundWorker1.IsBusy)
            {
                backgroundWorker1.CancelAsync();
            }
            else
            {
                backgroundWorker1.RunWorkerAsync();
            }
        }

        private void backgroundWorker1_DoWork(object sender, DoWorkEventArgs e)
        {
            Back_Up();
        }

        private void backgroundWorker1_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            Log();

            File_Delete();

            label2.Visible = false;
        }

        private void button1_Click(object sender, EventArgs e)
        {
            label2.Visible = true;
            if (backgroundWorker1.IsBusy)
            {
                backgroundWorker1.CancelAsync();
            }
            else
            {
                backgroundWorker1.RunWorkerAsync();
            }
        }

        private void Back_Up()
        {
            DateTime dt = DateTime.Now;

            string S_dt = dt.ToString("yyyy年MM月dd日");
            M_Folder_Name = Local_Path + S_dt;

            if (System.IO.Directory.Exists(M_Folder_Name) != true)
            {
                System.IO.Directory.CreateDirectory(M_Folder_Name);
            }

            S_dt = dt.ToString("yyyy年MM月dd日HH時mm分");
            H_Folder_Name = M_Folder_Name + @"\" + S_dt;
            if (System.IO.Directory.Exists(H_Folder_Name) != true)
            {
                System.IO.Directory.CreateDirectory(H_Folder_Name);
                System.IO.Directory.CreateDirectory(H_Folder_Name + @"\FTP\Data");
                System.IO.Directory.CreateDirectory(H_Folder_Name + @"\FTP\Group_Item");
               // System.IO.Directory.CreateDirectory(H_Folder_Name + @"\FTP\Image");
                System.IO.Directory.CreateDirectory(H_Folder_Name + @"\Local");
            }



            FTP_DL_1();
            FTP_DL_2();
            //FTP_DL_3();

            Local_Back_Up();


        }

        private void FTP_DL_1()
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
                if (textBox1.Lines[hh].ToString().Contains(".") == true)
                {
                    string F_N = textBox1.Lines[hh].ToString().Replace(" ", "");
                    string F_file = "ftp://" + FTP_Name + "/httpdocs/Member/Data/" + F_N;

                    string Path = H_Folder_Name + @"\FTP\Data\" + F_N;

                    System.Net.WebClient wc = new System.Net.WebClient();
                    wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
                    wc.DownloadFile(F_file, Path);
                    wc.Dispose();


                }

            }
            sr.Close();

            ftpRes.Close();


        }

        private void FTP_DL_2()
        {
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
                if (textBox1.Lines[hh].ToString().Contains(".") == true)
                {
                    string F_N = textBox1.Lines[hh].ToString().Replace(" ", "");
                    string F_file = "ftp://" + FTP_Name + "/httpdocs/Member/Group_Item/" + F_N;

                    string Path = H_Folder_Name + @"\FTP\Group_Item\" + F_N;

                    System.Net.WebClient wc = new System.Net.WebClient();
                    wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
                    wc.DownloadFile(F_file, Path);
                    wc.Dispose();


                }

            }
            sr.Close();

            ftpRes.Close();


        }

        private void FTP_DL_3()
        {
            Uri u = new Uri("ftp://" + FTP_Name + "/httpdocs/Member/Image/");

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
                if (textBox1.Lines[hh].ToString().Contains(".") == true)
                {
                    string F_N = textBox1.Lines[hh].ToString().Replace(" ", "");
                    string F_file = "ftp://" + FTP_Name + "/httpdocs/Member/Image/" + F_N;

                    string Path = H_Folder_Name + @"\FTP\Image\" + F_N;

                    System.Net.WebClient wc = new System.Net.WebClient();
                    wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
                    wc.DownloadFile(F_file, Path);
                    wc.Dispose();


                }

            }
            sr.Close();

            ftpRes.Close();


        }

        private void Local_Back_Up()
        {
            foreach (string F_name in System.IO.Directory.GetFiles(Local_Data))
            {
                string FF = System.IO.Path.GetFileName(F_name);

                System.IO.File.Copy(F_name, H_Folder_Name + @"\Local\" + FF, true);

            }




        }

        private void Log()
        {
            string path = folderpass + @"\BackUp_Log.xml";
            if (System.IO.File.Exists(path) == true)
            {
                dataSet1.DataTable1.Clear();
                dataSet1.DataTable1.ReadXml(path);
            }           

            DateTime dt = DateTime.Now;
            dataSet1.DataTable1.Rows.Add(dt.ToString("yyyy年MM月dd日 HH時mm分") + "　バックアップ作成");

            while (dataSet1.DataTable1.Rows.Count > 100)//////////////////////////////////100件
            {
                dataSet1.DataTable1.Rows.RemoveAt(0);
            }


            path = folderpass + @"\BackUp_Log.xml";
            dataSet1.DataTable1.WriteXml(path);

            DataTable sort_table = dataSet1.DataTable1.Clone();
            DataView dv = new DataView(dataSet1.DataTable1);
            dv.Sort = "日時 DESC";
            foreach (DataRowView abc in dv)
            {
                sort_table.ImportRow(abc.Row);
            }

            dataSet1.DataTable1.Clear();
            for (int hh = 0; hh < sort_table.Rows.Count; hh++)
            {
                DataRow N_Row = dataSet1.DataTable1.NewRow();
                for (int ii = 0; ii < sort_table.Columns.Count; ii++)
                {
                    N_Row[ii] = sort_table.Rows[hh][ii].ToString();
                }
                dataSet1.DataTable1.Rows.Add(N_Row);
            }

            dataGridView1.ClearSelection();
            label3.Text = dataSet1.DataTable1.Rows.Count.ToString() + " 件";
        }

        private void File_Delete()
        {

            Local_Path = folderpass.Replace(@"Back_Up\Back_Up\bin\Debug", "");
            Local_Path += @"バックアップデータ\";

            while (true)
            {
                int zz = 0;
                foreach (string F_name in System.IO.Directory.GetDirectories(Local_Path))
                {
                    DateTime dt = DateTime.Now;
                    string S_dt = dt.ToString("yyyy年MM月dd日");
                    dt = DateTime.Parse(S_dt);
                    dt = dt.AddDays(-BackUp_Span);
                    
                    string FF = System.IO.Path.GetFileName(F_name);
                    DateTime dd;
                    if (DateTime.TryParse(FF, out dd) == true)
                    {
                        if (dt >= dd)
                        {
                            System.IO.Directory.Delete(F_name, true);
                            zz++;
                            break;
                        }
                    }


                }
                if (zz == 0)
                {
                    break;
                }
            }

        }

       
    }
}
