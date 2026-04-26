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
    public partial class Form8 : Form
    {
        public Form8()
        {
            InitializeComponent();
        }

        private void Form8_Load(object sender, EventArgs e)
        {
            string folderpass = System.IO.Directory.GetCurrentDirectory();
            string folder_P = folderpass.Replace(@"\Local_Nanki\Local_Nanki\bin\Debug", @"\バックアップデータ\");
            
            foreach (string F_name in System.IO.Directory.GetDirectories(folder_P))
            {
                int F_leng = F_name.Length;
                string FF = F_name.Remove(0, F_leng - 11);
                listBox1.Items.Add(FF);

            }

            if (listBox1.Items.Count > 0)
            {
                listBox1.SelectedIndex = listBox1.Items.Count - 1;
            }
        }

        private void listBox1_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (listBox1.SelectedIndex != -1)
            {
                listBox2.Items.Clear();
                string folderpass = System.IO.Directory.GetCurrentDirectory();
                string folder_P = folderpass.Replace(@"\Local_Nanki\Local_Nanki\bin\Debug", @"\バックアップデータ\");

                foreach (string F_name in System.IO.Directory.GetDirectories(folder_P + listBox1.SelectedItem.ToString()))
                {
                    int F_leng = F_name.Length;
                    string FF = F_name.Remove(0, F_leng - 17);

                    listBox2.Items.Add(FF);
                }
            }
        }

        private void button1_Click(object sender, EventArgs e)/////////////////////復帰/////////////
        {
            if (listBox2.SelectedIndex == -1)
            {
                MessageBox.Show("日時を選択して下さい", "バックアップより復帰", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
            }
            else
            {
                DialogResult ret = MessageBox.Show(listBox2.SelectedItem.ToString() + "のデータを復帰します", "バックアップより復帰", MessageBoxButtons.OKCancel, MessageBoxIcon.Asterisk);

                if (ret == DialogResult.OK)
                {
                    backgroundWorker1.RunWorkerAsync();
                }

            }
        }

        private void button2_Click(object sender, EventArgs e)/////////////////////閉じる//////////
        {
            this.Close();
        }

        private void backgroundWorker1_DoWork(object sender, DoWorkEventArgs e)
        {
            string folderpass = System.IO.Directory.GetCurrentDirectory();
            string folder_P = folderpass.Replace(@"\Local_Nanki\Local_Nanki\bin\Debug", @"\バックアップデータ\" + listBox1.SelectedItem.ToString() + @"\");
             foreach (string F_name in System.IO.Directory.GetFiles(folder_P + listBox2.SelectedItem.ToString() + @"\Local\"))
            {
               
                string C_Folder = folderpass + @"\Data\";
                string FF = System.IO.Path.GetFileName(F_name);
                System.IO.File.Copy(F_name, C_Folder + FF, true);
            }
        }

        private void backgroundWorker1_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            MessageBox.Show("復帰 完了しました" + "\r\n" + "\r\n" + "ナンキ販売管理を再起動します" + "\r\n" + "\r\n" + "起動後『最新の状態に更新』をして下さい",
                "バックアップより復帰", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
            Application.Restart();
        }

        
    }
}
