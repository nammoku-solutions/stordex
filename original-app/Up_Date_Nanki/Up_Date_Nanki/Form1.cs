using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.IO;

namespace Up_Date_Nanki
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
        }

        private void Form1_Load(object sender, EventArgs e)
        {
            this.Icon = global::Up_Date_Nanki.Properties.Resources.k_01;
            label3.Text = "";
            folderpass = System.IO.Directory.GetCurrentDirectory();
            Local_Path = folderpass.Replace(@"Up_Date_Nanki\Up_Date_Nanki\bin\Debug", @"Local_Nanki\Local_Nanki\");

            string XML_F = folderpass + @"\FTP_data.xml";

            if (System.IO.File.Exists(XML_F) == true)
            {
                dataSet2.DataTable1.ReadXml(XML_F);
                FTP_Name = dataSet2.DataTable1.Rows[0][0].ToString();
                FTP_ID = dataSet2.DataTable1.Rows[0][1].ToString();
                FTP_PW = dataSet2.DataTable1.Rows[0][2].ToString();


                System.Diagnostics.Process[] ps = System.Diagnostics.Process.GetProcesses();
                int yy = 1;

              /*  while (yy == 1)
                {
                    yy = 0;
                    foreach (System.Diagnostics.Process p in ps)
                    {
                        if (p.ProcessName.ToString() == "Local_Nanki")
                        {
                            yy = 1;
                        }
                    }
                }*/

                backgroundWorker1.RunWorkerAsync(1000);            
            }
        }

        private string folderpass = "";

        private string Local_Path = "";
        private string FTP_Name = "";
        private string FTP_ID = "";
        private string FTP_PW = "";

        private int DL_Pos;
        private int DL_Pos_C;

        private void Up_Date_Load()
        {
            Up_Date_Count();
            DL_Pos_C = 0;
            Up_Date_DL_1();
            Up_Date_DL_2();
            Up_Date_DL_3();
            Up_Date_DL_4();
            Up_Date_DL_5();
            Up_Date_DL_6();

        }

        private void Up_Date_Count()
        {
            DL_Pos = 0;

            string FTP_1 = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/";
            
            Uri u = new Uri(FTP_1);
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
           


            //2
            FTP_1 = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/Resources/";
            u = new Uri(FTP_1);
            ftpReq = (System.Net.FtpWebRequest)System.Net.WebRequest.Create(u);
            ftpReq.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
            ftpReq.Method = System.Net.WebRequestMethods.Ftp.ListDirectory;
            ftpReq.KeepAlive = false;
            ftpReq.UsePassive = false;
            ftpRes = (System.Net.FtpWebResponse)ftpReq.GetResponse();
            sr = new System.IO.StreamReader(ftpRes.GetResponseStream());
            res = sr.ReadToEnd();
            textBox1.Text = res;
            DL_Pos += textBox1.Lines.Length - 1;
           

            //3
            FTP_1 = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/Properties/";
            u = new Uri(FTP_1);
            ftpReq = (System.Net.FtpWebRequest)System.Net.WebRequest.Create(u);
            ftpReq.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
            ftpReq.Method = System.Net.WebRequestMethods.Ftp.ListDirectory;
            ftpReq.KeepAlive = false;
            ftpReq.UsePassive = false;
            ftpRes = (System.Net.FtpWebResponse)ftpReq.GetResponse();
            sr = new System.IO.StreamReader(ftpRes.GetResponseStream());
            res = sr.ReadToEnd();
            textBox1.Text = res;
            DL_Pos += textBox1.Lines.Length - 1;
            

            //4
            FTP_1 = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/obj/Debug/";
            u = new Uri(FTP_1);
            ftpReq = (System.Net.FtpWebRequest)System.Net.WebRequest.Create(u);
            ftpReq.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
            ftpReq.Method = System.Net.WebRequestMethods.Ftp.ListDirectory;
            ftpReq.KeepAlive = false;
            ftpReq.UsePassive = false;
            ftpRes = (System.Net.FtpWebResponse)ftpReq.GetResponse();
            sr = new System.IO.StreamReader(ftpRes.GetResponseStream());
            res = sr.ReadToEnd();
            textBox1.Text = res;
            DL_Pos += textBox1.Lines.Length - 1;
           

            //5
            FTP_1 = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/obj/Debug/TempPE/";
            u = new Uri(FTP_1);
            ftpReq = (System.Net.FtpWebRequest)System.Net.WebRequest.Create(u);
            ftpReq.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
            ftpReq.Method = System.Net.WebRequestMethods.Ftp.ListDirectory;
            ftpReq.KeepAlive = false;
            ftpReq.UsePassive = false;
            ftpRes = (System.Net.FtpWebResponse)ftpReq.GetResponse();
            sr = new System.IO.StreamReader(ftpRes.GetResponseStream());
            res = sr.ReadToEnd();
            textBox1.Text = res;
            DL_Pos += textBox1.Lines.Length - 1;
            

            //6
            FTP_1 = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/bin/Debug/";
            u = new Uri(FTP_1);
            ftpReq = (System.Net.FtpWebRequest)System.Net.WebRequest.Create(u);
            ftpReq.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
            ftpReq.Method = System.Net.WebRequestMethods.Ftp.ListDirectory;
            ftpReq.KeepAlive = false;
            ftpReq.UsePassive = false;
            ftpRes = (System.Net.FtpWebResponse)ftpReq.GetResponse();
            sr = new System.IO.StreamReader(ftpRes.GetResponseStream());
            res = sr.ReadToEnd();
            textBox1.Text = res;
            DL_Pos += textBox1.Lines.Length - 1;
            


        }

        private void Up_Date_DL_1()
        {
            Uri u = new Uri("ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/");

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
                    string F_file = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/" + F_N;

                    string Path = Local_Path + F_N;
                    label3.Text = F_N;
                    System.Net.WebClient wc = new System.Net.WebClient();
                    wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
                    wc.DownloadFile(F_file, Path);
                    wc.Dispose();

                     backgroundWorker1.ReportProgress((1000 / DL_Pos) * DL_Pos_C);
                     DL_Pos_C++;
                }

            }
            sr.Close();

            ftpRes.Close();

        }

        private void Up_Date_DL_2()
        {
            Uri u2 = new Uri("ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/Resources/");

            System.Net.FtpWebRequest ftpReq = (System.Net.FtpWebRequest)System.Net.WebRequest.Create(u2);

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
                    string F_file = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/Resources/" + F_N;

                    string Path = Local_Path + @"Resources\" + F_N;
                    label3.Text = @"Resources\" + F_N;
                    System.Net.WebClient wc = new System.Net.WebClient();
                    wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
                    wc.DownloadFile(F_file, Path);
                    wc.Dispose();

                    backgroundWorker1.ReportProgress((1000 / DL_Pos) * DL_Pos_C);
                    DL_Pos_C++;
                }

            }
            sr.Close();

            ftpRes.Close();


        }

        private void Up_Date_DL_3()
        {
            Uri u = new Uri("ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/Properties/");

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
                    string F_file = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/Properties/" + F_N;

                    string Path = Local_Path + @"Properties\" + F_N;
                    label3.Text = @"Properties\" + F_N;
                    System.Net.WebClient wc = new System.Net.WebClient();
                    wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
                    wc.DownloadFile(F_file, Path);
                    wc.Dispose();

                    backgroundWorker1.ReportProgress((1000 / DL_Pos) * DL_Pos_C);
                    DL_Pos_C++;
                }

            }
            sr.Close();

            ftpRes.Close();


        }

        private void Up_Date_DL_4()
        {
            Uri u = new Uri("ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/obj/Debug/");

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
                    string F_file = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/obj/Debug/" + F_N;

                    string Path = Local_Path + @"obj\Debug\" + F_N;
                    label3.Text = @"obj\Debug\" + F_N;
                    System.Net.WebClient wc = new System.Net.WebClient();
                    wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
                    wc.DownloadFile(F_file, Path);
                    wc.Dispose();

                    backgroundWorker1.ReportProgress((1000 / DL_Pos) * DL_Pos_C);
                    DL_Pos_C++;
                }

            }
            sr.Close();

            ftpRes.Close();


        }

        private void Up_Date_DL_5()
        {
            Uri u = new Uri("ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/obj/Debug/TempPE/");

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
                    string F_file = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/obj/Debug/TempPE/" + F_N;

                    string Path = Local_Path + @"obj\Debug\TempPE\" + F_N;
                    label3.Text = @"obj\Debug\TempPE\" + F_N;
                    System.Net.WebClient wc = new System.Net.WebClient();
                    wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
                    wc.DownloadFile(F_file, Path);
                    wc.Dispose();

                    backgroundWorker1.ReportProgress((1000 / DL_Pos) * DL_Pos_C);
                    DL_Pos_C++;
                }

            }
            sr.Close();

            ftpRes.Close();


        }

        private void Up_Date_DL_6()
        {
            Uri u = new Uri("ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/bin/Debug/");

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
                    string F_file = "ftp://" + FTP_Name + "/httpdocs/Up_Date/Local_Nanki/bin/Debug/" + F_N;

                    string Path = Local_Path + @"bin\Debug\" + F_N;
                    label3.Text = @"bin\Debug\" + F_N;
                    System.Net.WebClient wc = new System.Net.WebClient();
                    wc.Credentials = new System.Net.NetworkCredential(FTP_ID, FTP_PW);
                    wc.DownloadFile(F_file, Path);
                    wc.Dispose();

                    backgroundWorker1.ReportProgress((1000 / DL_Pos) * DL_Pos_C);
                    DL_Pos_C++;
                }
            }
            sr.Close();

            ftpRes.Close();


        }

        private void backgroundWorker1_DoWork(object sender, DoWorkEventArgs e)
        {
            Up_Date_Load();
        }

        private void backgroundWorker1_ProgressChanged(object sender, ProgressChangedEventArgs e)
        {
            progressBar1.Value = e.ProgressPercentage;
        }

        private void backgroundWorker1_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            MessageBox.Show("アップデート完了しました", "ナンキ販売管理", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);

            System.Diagnostics.Process[] ps1 = System.Diagnostics.Process.GetProcesses();
            int zz = 0;
            foreach (System.Diagnostics.Process p in ps1)
            {
                if (p.ProcessName.ToString() == "Local_Nanki")
                {
                    zz = 1;

                }
            }

            if (zz == 0)
            {               
                process1.StartInfo.FileName = Local_Path + @"bin\Debug\Local_Nanki.exe";
                process1.StartInfo.WorkingDirectory = Local_Path + @"bin\Debug";
                process1.Start();

            }

            this.Close();
        }
    }
}
