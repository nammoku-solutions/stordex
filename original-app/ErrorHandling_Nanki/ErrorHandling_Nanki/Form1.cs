using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ErrorHandling_Nanki
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
        }


        private string Folderpass = "";
        private string Folder_P = "";
        private string Folder_N = "";
        private string L_file = "";
        private string R_file = "";

        private string Check = "";

        private void Form1_Load(object sender, EventArgs e)
        {
            this.Icon = global::ErrorHandling_Nanki.Properties.Resources.a_05;

            Folderpass = System.IO.Directory.GetCurrentDirectory();

            Folder_P = Folderpass.Replace(@"\ErrorHandling_Nanki\ErrorHandling_Nanki\bin\Debug", @"\バックアップデータ\");

            Folder_N = Folderpass.Replace(@"\ErrorHandling_Nanki\ErrorHandling_Nanki\bin\Debug", @"\Local_Nanki\Local_Nanki\bin\Debug\Data\");

            foreach (string F_name in System.IO.Directory.GetDirectories(Folder_P))
            {
                int F_leng = F_name.Length;
                string FF = F_name.Remove(0, F_leng - 11);
                listBox1.Items.Add(FF);
               
            }

            if (listBox1.Items.Count > 0)
            {
                listBox1.SelectedIndex = listBox1.Items.Count - 1;
            }


            foreach (string FF_name in System.IO.Directory.GetFiles(Folder_N))
            {
                string FFF = System.IO.Path.GetFileName(FF_name);

                System.IO.FileInfo fi = new System.IO.FileInfo(FF_name);
                long filesize = fi.Length;
                string F_S = filesize.ToString("n0");

                dataGridView2.Rows.Add(FFF, F_S);

            }


        }

        private void listBox1_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (listBox1.SelectedIndex != -1)
            {
                listBox2.Items.Clear();
                dataGridView1.Rows.Clear();

                foreach (string F_name in System.IO.Directory.GetDirectories(Folder_P + listBox1.SelectedItem.ToString()))
                {
                    int F_leng = F_name.Length;
                    string FF = F_name.Remove(0, F_leng - 17);

                    listBox2.Items.Add(FF);
                }
            }
        }

        private void listBox2_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (listBox2.SelectedIndex != -1)
            {
                dataGridView1.Rows.Clear();

                foreach (string F_name in System.IO.Directory.GetFiles(Folder_P + listBox1.SelectedItem.ToString() + @"\" + listBox2.SelectedItem.ToString() + @"\Local\"))
                {
                    string FF = System.IO.Path.GetFileName(F_name);

                    System.IO.FileInfo fi = new System.IO.FileInfo(F_name);
                    long filesize = fi.Length;
                    string F_S = filesize.ToString("n0");

                    dataGridView1.Rows.Add(FF, F_S);
                }
            }
        }

        private void button1_Click_1(object sender, EventArgs e)/////////////////////////////////////終了
        {
            if (Check == "True")
            {
                MessageBox.Show("終了後" + "\r\n" + "\r\n" + "ナンキ販売管理を起動し" + "\r\n" + "\r\n" +
                    "【最新の状態に更新】を行って下さい", "エラー対処", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
                this.Close();

            }
            else
            {
                this.Close();
            }
        }

        private void button2_Click(object sender, EventArgs e)//////////////////////////////////////コピー
        {
            if (dataGridView1.Rows.GetRowCount(DataGridViewElementStates.Selected) == 1 &&
                dataGridView2.Rows.GetRowCount(DataGridViewElementStates.Selected) == 1)
            {
               
                foreach (DataGridViewRow c in dataGridView1.SelectedRows)
                {
                    L_file = dataGridView1.Rows[c.Index].Cells[0].Value.ToString();
                    break;
                }
                foreach (DataGridViewRow c in dataGridView2.SelectedRows)
                {
                    R_file = dataGridView2.Rows[c.Index].Cells[0].Value.ToString();
                    break;
                }

                if (L_file == R_file)
                {
                    DialogResult ret =
                    MessageBox.Show(L_file + " をコピーします", "エラー対処", MessageBoxButtons.OKCancel, MessageBoxIcon.Asterisk);

                    if (ret == DialogResult.OK)
                    {
                        backgroundWorker1.RunWorkerAsync();                        
                    }
                }
                else
                {
                    MessageBox.Show("左右同じファイル名を指定して下さい", "エラー対処", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
                }
                
            }
            else
            {
                MessageBox.Show("左右両方のファイルを指定して下さい", "エラー対処", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
            }
        }

        private void backgroundWorker1_DoWork(object sender, DoWorkEventArgs e)
        {
            string LL = Folder_P + listBox1.SelectedItem.ToString() + @"\" + listBox2.SelectedItem.ToString() + @"\Local\" + L_file;
            string RR = Folder_N + R_file;

            System.IO.File.Copy(LL, RR, true);
        }

        private void backgroundWorker1_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            dataGridView2.Rows.Clear();

            foreach (string FF_name in System.IO.Directory.GetFiles(Folder_N))
            {
                string FFF = System.IO.Path.GetFileName(FF_name);

                System.IO.FileInfo fi = new System.IO.FileInfo(FF_name);
                long filesize = fi.Length;
                string F_S = filesize.ToString("n0");

                dataGridView2.Rows.Add(FFF, F_S);

            }


            MessageBox.Show("コピー完了しました" + "\r\n" + "\r\n" + "左上の【終了】をクリックして終了させて下さい", "エラー対処", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
            Check = "True";
        }
    }
}
